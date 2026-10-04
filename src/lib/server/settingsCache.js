// src/lib/server/settingsCache.js
//
// One way for server code to read an admin setting from portal_settings, with
// a one-minute cache: a server instance must not read it on every request, and
// a change an admin makes reaches every instance within a minute.
// ⚠ If the setting cannot be read, what is in force stays as it was (the
// defaults on a cold start) — a failed read never switches a control off or
// blanks a text.
// Used by $lib/server/policies.js and $lib/server/wording.js.

import { createClient }        from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { getLogger }           from '$lib/utils/logger';

const logger = getLogger('settingsCache');
const CACHE_MS = 60 * 1000;

let _db = null;
const db = () => (_db ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));

/**
 * A loader for one portal_settings key that hands the stored value to `apply`
 * at most once a minute.
 * @param {string} key
 * @param {(value: unknown) => unknown} apply
 * @returns {() => Promise<void>}
 */
export function cachedSetting(key, apply) {
  let readAt = 0;
  return async function load() {
    if (Date.now() - readAt < CACHE_MS) return;
    try {
      const { data, error } = await db()
        .from('portal_settings').select('value').eq('key', key).maybeSingle();
      if (error) throw error;
      apply(data?.value ?? null);
      readAt = Date.now();
    } catch (/** @type {any} */ err) {
      logger(`⚠ could not read the ${key} setting; keeping what is in force:`, err?.message);
    }
  };
}
