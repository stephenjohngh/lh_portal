// src/lib/server/signInOutcome.js
// What a Supabase sign-in error means for the person at the login page, and
// whether it counts towards the lockout ($lib/server/loginLockout.js).
//
// ⛔ WHY THIS EXISTS (2026-10-02). The login route answered EVERY Supabase
// error with "Invalid email or password" and recorded it as a failed attempt.
// When the Email provider was switched off in Supabase Auth, every sign-in came
// back `422 email_provider_disabled` — the password was never checked — and the
// only admin was told their password was wrong, went to reset it in the
// database, and locked themselves out with the retries.
//
// The rule now:
//   · A WRONG PASSWORD (or unknown email) is the only thing that counts as a
//     failed attempt, and it keeps the generic message: no email enumeration.
//   · Anything else means the password was NOT checked, so it never counts
//     towards the lockout, and the message says so. Counting it would lock an
//     owner out for a fault that is not theirs, and gains a guesser nothing,
//     since an unchecked password reveals nothing.
//
// ⚠ An error we do not recognise is treated as "not checked", not as a wrong
// password. That is the safe direction: a guesser's wrong passwords still come
// back as `invalid_credentials` and still count, while an owner is never locked
// out by a service fault.

/** The message for a wrong password or unknown email — deliberately generic. */
export const WRONG_CREDENTIALS = 'Invalid email or password';

const NOT_CHECKED = 'Your password was not checked, and this attempt does not count towards the lockout.';

/**
 * @param {{ status?: number, code?: string, message?: string, name?: string } | null | undefined} error
 *   the `error` from supabase.auth.signInWithPassword, or a thrown value
 * @returns {{ countsAsFailure: boolean, status: number, message: string, reason: string }}
 *   `status` is the HTTP status for our own response; `reason` is a short code
 *   for the audit log and the response body
 */
export function signInOutcome(error) {
  const code    = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '');
  const status  = Number(error?.status ?? 0);

  // Older GoTrue versions send no code, only this message (as `invalid_grant`).
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return { countsAsFailure: true, status: 401, message: WRONG_CREDENTIALS, reason: 'invalid_credentials' };
  }

  if (code === 'email_provider_disabled') {
    return {
      countsAsFailure: false, status: 503, reason: code,
      message: `Signing in with an email and password is switched off in Supabase Auth. An administrator needs to switch the Email provider back on. ${NOT_CHECKED}`,
    };
  }

  if (status === 429 || code === 'over_request_rate_limit') {
    return {
      countsAsFailure: false, status: 429, reason: code || 'rate_limited',
      message: `Supabase is limiting sign-in attempts at the moment. Wait a few minutes and try again. ${NOT_CHECKED}`,
    };
  }

  if (code === 'email_not_confirmed') {
    return {
      countsAsFailure: false, status: 403, reason: code,
      message: 'This account’s email address has not been confirmed. Ask an administrator.',
    };
  }

  if (code === 'user_banned') {
    return {
      countsAsFailure: false, status: 403, reason: code,
      message: 'This account has been disabled. Ask an administrator.',
    };
  }

  return {
    countsAsFailure: false, status: 503, reason: code || (status ? `status_${status}` : 'unavailable'),
    message: `Sign-in is not available right now${code ? ` (${code})` : ''}. ${NOT_CHECKED} Try again shortly, or tell an administrator.`,
  };
}
