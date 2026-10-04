// src/lib/server/policies.js
//
// The policy numbers an admin set (Admin → Other Config → Policies), for code
// that runs on the server: sign-in lockout, rate limits, the file pass, the
// public MOR form. See #lib/utils/policies.js; the one-minute cache, and why a
// failed read keeps what is in force, are in #lib/server/settingsCache.js.

import { cachedSetting } from '#lib/server/settingsCache.js';
import { POLICIES_KEY, setPolicies, policy, rateLimit } from '#lib/utils/policies.js';

/** Make sure the policies in force are no more than a minute old. */
export const loadServerPolicies = cachedSetting(POLICIES_KEY, setPolicies);

/** A policy's value, read fresh enough. @param {string} key */
export async function serverPolicy(key) {
  await loadServerPolicies();
  return policy(key);
}

/** A rate limit in force, read fresh enough. @param {string} action */
export async function serverRateLimit(action) {
  await loadServerPolicies();
  return rateLimit(action);
}
