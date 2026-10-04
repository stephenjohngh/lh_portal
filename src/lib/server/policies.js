// src/lib/server/policies.js
//
// The policy numbers an admin set (Admin → Other Config → Policies), for code
// that runs on the server: sign-in lockout, rate limits, the file pass, the
// public MOR form. See $lib/utils/policies.js.
//
// Read with a one-minute cache: a server instance must not read the setting on
// every request, and a change an admin makes reaches every instance within a
// minute. ⚠ If the setting cannot be read, the policies in force stay as they
// were (the defaults on a cold start) — a control is never switched OFF by a
// failed read.

import { createClient }        from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { POLICIES_KEY, setPolicies, policy, rateLimit } from '$lib/utils/policies.js';
import { getLogger }           from '$lib/utils/logger';

const logger = getLogger('policies');
const CACHE_MS = 60 * 1000;

let _db = null;
const db = () => (_db ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));
let readAt = 0;

/** Make sure the policies in force are no more than a minute old. */
export async function loadServerPolicies() {
  if (Date.now() - readAt < CACHE_MS) return;
  try {
    const { data, error } = await db()
      .from('portal_settings').select('value').eq('key', POLICIES_KEY).maybeSingle();
    if (error) throw error;
    setPolicies(data?.value ?? null);
    readAt = Date.now();
  } catch (/** @type {any} */ err) {
    logger('⚠ could not read the policies; keeping those in force:', err?.message);
  }
}

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
