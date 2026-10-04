// src/lib/server/publicRateLimit.js
// Rate-limiting helper for unauthenticated public endpoints.
// Stores hashed IP addresses in public_upload_attempts via the service role.
//
// Usage:
//   const ok = await checkRateLimit(request, 'photo_upload');
//   if (!ok) return json({ error: 'Too many requests' }, { status: 429 });

import { createHash }            from 'crypto';
import { createClient }          from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import * as env from '$app/env/private';
import { getLogger } from '#lib/utils/logger.js';
import { serverRateLimit } from '#lib/server/policies.js';

const logger = getLogger('publicRateLimit');

// The limits are admin policies (Admin → Other Config → Policies): the number
// allowed per window, with the window fixed, declared in #lib/utils/policies.js
// (RATE_LIMIT_WINDOWS) and read fresh here (serverRateLimit). Each action is
// also in public_upload_attempts' CHECK — dbRulesParity.test.js holds the two
// lists together, because until migration 233 the four Dossier actions were
// missing from it and their attempts were never recorded.

// Module-level singleton for the service role client
let _svc = null;
function getSvc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');
  return _svc;
}

/**
 * Extract the caller's IP from request headers — TRUSTED sources only (M1,
 * 2026-07-02 security review). The FIRST x-forwarded-for entry is client-
 * controlled (proxies APPEND; attackers prepend), so keying the limiter on it
 * let a scripted caller mint a fresh identity per request and bypass every
 * public rate limit — including the status-lookup limit that the verification
 * code's brute-force resistance depends on.
 *
 * Order of trust:
 *   1. x-nf-client-connection-ip — set by Netlify itself, not spoofable.
 *   2. LAST x-forwarded-for entry — appended by the closest (platform) proxy.
 *   3. x-real-ip — set by some reverse proxies (Northflank/nginx).
 */
function getClientIp(request) {
  const netlify = request.headers.get('x-nf-client-connection-ip');
  if (netlify) return netlify.trim();

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }

  return request.headers.get('x-real-ip') ?? '0.0.0.0';
}

/**
 * Hash the IP with a project-specific salt so raw IPs are never stored.
 * The Supabase URL is unique per project and always available server-side.
 */
function hashIp(ip) {
  const salt = PUBLIC_SUPABASE_URL;
  return createHash('sha256').update(ip + salt).digest('hex').slice(0, 40);
}

/**
 * Check whether the caller has exceeded the rate limit for `action`.
 * Records the attempt if under the limit.
 * Cleans up entries older than 2× the window (fire-and-forget).
 *
 * @param {Request} request
 * @param {'photo_upload' | 'case_submit'} action
 * @returns {Promise<boolean>} true = under limit (allowed), false = over limit (reject)
 */
export async function checkRateLimit(request, action) {
  const ip = getClientIp(request);
  return checkKeyRateLimit(ip, action);
}

/**
 * Rate-limit by an arbitrary caller key instead of the request IP — used by
 * authenticated endpoints that limit per user id (e.g. `user:<uuid>` for the
 * AI-assist routes). The key is hashed with the same salt as IPs before
 * storage; the ip_hash column name is historical.
 *
 * @param {string} key     Stable caller identity (raw IP, or 'user:<uuid>')
 * @param {string} action  a key of RATE_LIMIT_WINDOWS
 * @returns {Promise<boolean>} true = under limit (allowed), false = over limit (reject)
 */
export async function checkKeyRateLimit(key, action) {
  const limit  = await serverRateLimit(action);
  if (!limit)  { logger('⚠ Unknown action:', action); return true; }

  const ipHash = hashIp(key);
  const svc    = getSvc();
  const since  = new Date(Date.now() - limit.windowMinutes * 60 * 1000).toISOString();

  try {
    // Count recent attempts within the window
    const { count, error: cErr } = await svc
      .from('public_upload_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .eq('action', action)
      .gte('created_at', since);

    if (cErr) { logger('⚠ Rate limit count error:', cErr.message); return true; }
    if ((count ?? 0) >= limit.max) return false;

    // Record this attempt. ⛔ Read the result: an attempt the table refuses is
    // never counted, so the limit silently stops limiting — exactly what the
    // Dossier actions did until migration 233.
    const { error: iErr } = await svc.from('public_upload_attempts').insert({ ip_hash: ipHash, action });
    if (iErr) logger('❌ Rate limit attempt NOT recorded — this limit is not limiting:', action, iErr.message);

    // Cleanup stale rows (fire-and-forget — don't block the response).
    // Scoped to this action: windows differ per action, so an unscoped
    // delete from a short-window action would drop rows other actions'
    // longer windows still need.
    const cutoff = new Date(Date.now() - limit.windowMinutes * 2 * 60 * 1000).toISOString();
    svc.from('public_upload_attempts').delete()
      .eq('action', action).lt('created_at', cutoff)
      .then(() => {}).catch(() => {});

    return true;
  } catch (/** @type {any} */ err) {
    logger('⚠ Rate limit check failed:', err.message, '— allowing request');
    return true; // Fail open so a DB hiccup doesn't block legitimate reports
  }
}
