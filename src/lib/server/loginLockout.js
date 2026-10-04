// src/lib/server/loginLockout.js
// When a login is refused for too many failures (security review, 2026-09-27).
//
// It used to be FIVE failures per EMAIL in 15 minutes, from anywhere — so
// anyone who knew an address could lock its owner out, on demand, with five
// wrong passwords. Now there are two limits:
//
//   · 5 failures for this email FROM THIS ADDRESS — what one guesser meets;
//   · 20 failures for this email FROM ANYWHERE — the ceiling a guesser who
//     rotates addresses (or forges the header) meets.
//
// So the owner, signing in from somewhere else, is not locked out by a
// stranger's five tries; locking them out takes twenty, which is itself a loud
// signal in the audit log. Guessing stays capped at twenty per quarter-hour
// per account however many addresses are used.
//
// ⚠ The address comes from getClientAddress() (Netlify's own client IP), not a
// header a caller writes. Where the platform cannot tell callers apart (a
// proxy with no forwarded-address config), every caller shares one address
// and the per-address limit behaves exactly as the old per-email one did —
// the failure mode is the previous behaviour, never a weaker one.

// ⭐ The three numbers are admin policies (Admin → Other Config → Policies,
// 2026-10-04): 5, 20 and 15 are the shipped defaults, with bounds that keep the
// lockout a lockout ($lib/utils/policies.js). Read when used — the caller
// refreshes them first (passwordCheck → loadServerPolicies).
import { policy } from '$lib/utils/policies.js';

/** The limits in force now. */
export function lockoutLimits() {
  return {
    perAddress:    policy('loginFailuresPerAddress'),
    perAccount:    policy('loginFailuresPerAccount'),
    windowMinutes: policy('loginPauseMinutes'),
  };
}

/**
 * @param {Array<{ ip_address: string|null }>} recentFailures  this email's failures in the window
 * @param {string|null} address  the caller's address
 * @param {{ perAddress: number, perAccount: number }} [limits]
 */
export function lockoutState(recentFailures, address, limits = lockoutLimits()) {
  const fromAnywhere = recentFailures.length;
  const fromHere = recentFailures.filter((f) => (f.ip_address ?? null) === (address ?? null)).length;
  const locked = fromHere >= limits.perAddress || fromAnywhere >= limits.perAccount;
  // After one more failure, how many would be left before a lock — the lower
  // of the two limits, never negative.
  const remainingAfterFailure = Math.max(0,
    Math.min(limits.perAddress - (fromHere + 1), limits.perAccount - (fromAnywhere + 1)));
  return { locked, fromHere, fromAnywhere, remainingAfterFailure };
}
