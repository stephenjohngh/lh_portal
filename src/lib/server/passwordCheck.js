// src/lib/server/passwordCheck.js
//
// Checking a password, the ONE way (2026-10-02, PROJECT_STATUS §6bbb item 3).
// Used by /api/auth/login and /api/auth/change-password.
//
// It used to be written once inside the login route, and Settings checked the
// current password a second way: a browser signInWithPassword. That skipped the
// lockout and the audit log, and answered EVERY error with "Current password is
// incorrect" — the fault the login route had just been fixed for (§6zz, a
// switched-off Email provider read as a wrong password).
//
// The steps, in order:
//   1. the lockout ($lib/server/loginLockout.js) — refuse before asking Supabase
//   2. Supabase Auth checks the password (anon key)
//   3. $lib/server/signInOutcome.js decides what an error means: only a WRONG
//      PASSWORD counts towards the lockout; anything else was not checked
//   4. the attempt is recorded in login_attempts (service role; that table has
//      RLS on and no policies, so nothing else can read or write it)
//   5. a failure is audit-logged

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { logFailedLogin, getIpAddress, getUserAgent } from '$lib/server/auditLogger';
import { lockoutState, PER_EMAIL_LIMIT, WINDOW_MINUTES } from '$lib/server/loginLockout';
import { signInOutcome } from '$lib/server/signInOutcome';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('PasswordCheck');

const supabaseAnon  = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/** The admin client, for a route that must act on the account afterwards. */
export const adminClient = () => supabaseAdmin;

/**
 * This email's failed attempts in the last WINDOW_MINUTES, with the address
 * each came from. loginLockout.js decides what they mean.
 * @param {string} emailLower
 * @returns {Promise<Array<{ ip_address: string|null }>>}
 */
async function recentFailures(emailLower) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('login_attempts')
    .select('ip_address')
    .eq('email_lower', emailLower)
    .eq('succeeded',   false)
    .gt('attempted_at', since)
    .limit(PER_EMAIL_LIMIT + 1);
  if (error) {
    // Fail open with a logged warning — DB outage shouldn't lock everyone out.
    logger('⚠ Rate-limit lookup failed, allowing attempt:', error.message);
    return [];
  }
  return data ?? [];
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
    .insert({ email_lower: emailLower, ip_address: ip, user_agent: userAgent, succeeded });
  if (error) logger('⚠ login_attempts insert failed:', error.message);
}

/**
 * The caller's address as the PLATFORM sees it — Netlify's own client IP —
 * rather than a header a caller can write; the header is the fallback only.
 * @param {Request} request
 * @param {() => string} [getClientAddress]
 */
function clientAddress(request, getClientAddress) {
  try {
    const a = getClientAddress?.();
    if (a) return a;
  } catch { /* not available on this platform */ }
  return getIpAddress(request);
}

/**
 * Check one email and password, under the lockout.
 *
 * @param {{ email: string, password: string, request: Request,
 *           getClientAddress?: () => string, purpose?: string }} args
 *   `purpose` goes into the audit entry for a failure ('login' by default)
 * @returns {Promise<
 *     { ok: true,  data: any, recentFails: number }
 *   | { ok: false, kind: 'locked',      status: 429, lock: any }
 *   | { ok: false, kind: 'not_checked', status: number, outcome: any }
 *   | { ok: false, kind: 'wrong',       status: number, outcome: any, attemptsRemaining: number }>}
 */
export async function checkPassword({ email, password, request, getClientAddress, purpose = 'login' }) {
  const emailLower = String(email).toLowerCase().trim();
  const ip         = clientAddress(request, getClientAddress);
  const userAgent  = getUserAgent(request);
  const note       = purpose === 'login' ? '' : ` [${purpose}]`;

  // 1. The lockout, before Supabase is asked anything.
  const lock = lockoutState(await recentFailures(emailLower), ip);
  if (lock.locked) {
    logger('🚨 Locked out by rate limit:', emailLower,
      `(${lock.fromHere} from this address, ${lock.fromAnywhere} in all)`);
    await logFailedLogin(emailLower, request, `account_locked_too_many_attempts${note}`);
    return { ok: false, kind: 'locked', status: 429, lock };
  }

  // 2. Supabase checks the password. A throw (network, SDK) is treated like
  //    any other error it returns: the password was not checked.
  /** @type {any} */ let data = null, error = null;
  try {
    ({ data, error } = await supabaseAnon.auth.signInWithPassword({ email: emailLower, password }));
  } catch (/** @type {any} */ err) {
    error = err ?? new Error('Sign-in failed');
  }

  if (error) {
    const outcome = signInOutcome(error);
    // ⛔ Only a WRONG PASSWORD is a failed attempt. Anything else never checked
    // the password, so it must not count towards the lockout or read as one.
    if (!outcome.countsAsFailure) {
      logger('⚠ Sign-in not checked:', emailLower, outcome.reason, error?.message);
      logFailedLogin(emailLower, request, `not checked (${outcome.reason})${note}: ${error?.message ?? ''}`)
        .catch(err => logger('Audit log failed:', err.message));
      return { ok: false, kind: 'not_checked', status: outcome.status, outcome };
    }

    // 3. Record the failure for the next attempt's lockout lookup.
    await recordAttempt(emailLower, ip, userAgent, false);
    logger('❌ Wrong password:', emailLower, purpose);
    logFailedLogin(emailLower, request,
      `${error.message}${note} (${lock.fromHere + 1} from this address, ${lock.fromAnywhere + 1} in all)`,
    ).catch(err => logger('Audit log failed:', err.message));
    return { ok: false, kind: 'wrong', status: outcome.status, outcome,
             attemptsRemaining: lock.remainingAfterFailure };
  }

  // 4. Record the success.
  await recordAttempt(emailLower, ip, userAgent, true);
  return { ok: true, data, recentFails: lock.fromAnywhere };
}

export { WINDOW_MINUTES };
