// src/routes/api/auth/login/+server.js
//
// Server-side login endpoint. Exists *specifically* to enforce per-email
// rate limiting before the credentials are forwarded to Supabase Auth —
// see CLAUDE.md "Auth — server-routed login" for the design note.
//
// Flow:
//   1. POST { email, password } from auth.js (client)
//   2. Look up this email's failed attempts in login_attempts (last 15 min)
//   3. If locked (5 from this address, or 20 from anywhere —
//      #lib/server/loginLockout.js), reject with 429 and audit-log it
//   4. Otherwise call supabase.auth.signInWithPassword() using the anon
//      key — this is the same call the client used to make directly,
//      but going via the server lets us record the outcome
//   5. Insert a row into login_attempts for the next attempt's lookup —
//      a success, or a WRONG PASSWORD. Any other Supabase error (email
//      logins switched off, Supabase down) never checked the password, so it
//      is not recorded as a failure and the person is told so
//      (#lib/server/signInOutcome.js)
//   6. On success, return the Supabase session so the client can hydrate
//      its local Supabase client via supabase.auth.setSession(...)
//   7. Audit log via logLogin / logFailedLogin (writes to audit_logs)
//
// Steps 2–5 are #lib/server/passwordCheck.js, shared with
// /api/auth/change-password so a password is checked one way only.

import { json }                     from '@sveltejs/kit';
import { logLogin }                 from '#lib/server/auditLogger.js';
import { checkPassword, pauseMinutes } from '#lib/server/passwordCheck.js';
import { getLogger }                from '#lib/utils/logger.js';

const logger = getLogger('AuthLogin');

export async function POST({ request, getClientAddress }) {
  let email, password;
  try {
    ({ email, password } = await request.json());
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!email || !password) {
    return json({ error: 'Email and password required' }, { status: 400 });
  }

  const result = await checkPassword({ email, password, request, getClientAddress });

  if (result.kind === 'locked') {
    return json({
      error:  `Too many failed attempts. Please try again in ${pauseMinutes()} minutes.`,
      locked: true,
    }, { status: 429 });
  }
  if (result.kind === 'not_checked') {
    const { outcome } = result;
    return json({ error: outcome.message, reason: outcome.reason, passwordChecked: false },
      { status: outcome.status });
  }
  if (result.kind === 'wrong') {
    return json({
      error:             result.outcome.message,  // generic — no email enumeration
      attemptsRemaining: result.attemptsRemaining,
    }, { status: result.outcome.status });
  }

  // Success — audit log and return the session to the client
  const { data } = result;
  logger('✅ Login successful:', data.user.email);
  logLogin(data.user.id, data.user.email, request, {
    session_id: data.session.access_token.substring(0, 20),
    provider:   'email',
    previous_failed_attempts: result.recentFails,
  }).catch(err => logger('Audit log failed:', err.message));

  return json({
    success: true,
    user:    data.user,
    session: data.session,
  });
}
