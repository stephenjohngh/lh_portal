// src/routes/api/auth/login/+server.js
//
// Server-side login endpoint. Exists *specifically* to enforce per-email
// rate limiting before the credentials are forwarded to Supabase Auth —
// see CLAUDE.md "Auth — server-routed login" for the design note.
//
// Flow:
//   1. POST { email, password } from auth.js (client)
//   2. Look up failed-attempt count in login_attempts (last 15 min)
//   3. If >= MAX_FAILED_ATTEMPTS, reject with 429 and audit-log it
//   4. Otherwise call supabase.auth.signInWithPassword() using the anon
//      key — this is the same call the client used to make directly,
//      but going via the server lets us record the outcome
//   5. Insert a row into login_attempts (success or fail) for the next
//      attempt's lookup
//   6. On success, return the Supabase session so the client can hydrate
//      its local Supabase client via supabase.auth.setSession(...)
//   7. Audit log via logLogin / logFailedLogin (writes to audit_logs)
//
// Two Supabase clients:
//   - anon   → used for the actual signInWithPassword call
//   - admin  → used for login_attempts INSERT/SELECT (service role
//              bypasses RLS, which is enabled with no policies)

import { json }                                       from '@sveltejs/kit';
import { createClient }                               from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { logLogin, logFailedLogin, getIpAddress, getUserAgent } from '$lib/server/auditLogger';
import { getLogger }                                  from '$lib/utils/logger';

const logger = getLogger('AuthLogin');

const supabaseAnon  = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES      = 15;

/**
 * Count failed login attempts for this email in the last WINDOW_MINUTES.
 * @param {string} emailLower
 * @returns {Promise<number>}
 */
async function recentFailureCount(emailLower) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await supabaseAdmin
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('email_lower', emailLower)
    .eq('succeeded',   false)
    .gt('attempted_at', since);
  if (error) {
    // Fail open with a logged warning — DB outage shouldn't lock everyone out.
    logger('⚠ Rate-limit lookup failed, allowing attempt:', error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * @param {string}  emailLower
 * @param {string?} ip
 * @param {string?} userAgent
 * @param {boolean} succeeded
 */
async function recordAttempt(emailLower, ip, userAgent, succeeded) {
  const { error } = await supabaseAdmin
    .from('login_attempts')
    .insert({
      email_lower:  emailLower,
      ip_address:   ip,
      user_agent:   userAgent,
      succeeded,
    });
  if (error) logger('⚠ login_attempts insert failed:', error.message);
}

export async function POST({ request }) {
  let email, password;
  try {
    ({ email, password } = await request.json());
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!email || !password) {
    return json({ error: 'Email and password required' }, { status: 400 });
  }

  const emailLower = String(email).toLowerCase().trim();
  const ip         = getIpAddress(request);
  const userAgent  = getUserAgent(request);

  // 1. Rate-limit check
  const recentFails = await recentFailureCount(emailLower);
  if (recentFails >= MAX_FAILED_ATTEMPTS) {
    logger('🚨 Locked out by rate limit:', emailLower, `(${recentFails} recent failures)`);
    await logFailedLogin(emailLower, request, 'account_locked_too_many_attempts');
    return json({
      error:  `Too many failed attempts. Please try again in ${WINDOW_MINUTES} minutes.`,
      locked: true,
    }, { status: 429 });
  }

  // 2. Forward to Supabase Auth via the anon client — same call the
  //    browser used to make directly, but server-side so we can audit.
  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email: emailLower,
    password,
  });

  // 3. Record the outcome for the next attempt's rate-limit lookup
  await recordAttempt(emailLower, ip, userAgent, !error);

  if (error) {
    logger('❌ Login failed:', emailLower);
    // Fire-and-forget audit log (logFailedLogin awaits internally; not blocking the response materially)
    logFailedLogin(emailLower, request,
      `${error.message} (attempt ${recentFails + 1}/${MAX_FAILED_ATTEMPTS})`,
    ).catch(err => logger('Audit log failed:', err.message));

    return json({
      error:             'Invalid email or password',  // generic — no email-enumeration
      attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - (recentFails + 1)),
    }, { status: 401 });
  }

  // 4. Success — audit log and return the session to the client
  logger('✅ Login successful:', emailLower);
  logLogin(data.user.id, data.user.email, request, {
    session_id: data.session.access_token.substring(0, 20),
    provider:   'email',
    previous_failed_attempts: recentFails,
  }).catch(err => logger('Audit log failed:', err.message));

  return json({
    success: true,
    user:    data.user,
    session: data.session,
  });
}
