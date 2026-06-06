// src/lib/server/publicRateLimit.js
// Rate-limiting helper for unauthenticated public endpoints.
// Stores hashed IP addresses in public_upload_attempts via the service role.
//
// Usage:
//   const ok = await checkRateLimit(request, 'photo_upload');
//   if (!ok) return json({ error: 'Too many requests' }, { status: 429 });

import { createHash }            from 'crypto';
import { createClient }          from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }   from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('publicRateLimit');

// Limits per action
const LIMITS = {
  photo_upload: { max: 10, windowMinutes: 15  }, // 10 photos per 15 min
  case_submit:  { max:  3, windowMinutes: 60  }, // 3 submissions per hour
};

// Module-level singleton for the service role client
let _svc = null;
function getSvc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return _svc;
}

/**
 * Extract the caller's IP from request headers.
 * Netlify Functions set x-forwarded-for; fall back to x-real-ip.
 */
function getClientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '0.0.0.0'
  );
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
  const limit  = LIMITS[action];
  if (!limit)  { logger('⚠ Unknown action:', action); return true; }

  const ip     = getClientIp(request);
  const ipHash = hashIp(ip);
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

    // Record this attempt
    await svc.from('public_upload_attempts').insert({ ip_hash: ipHash, action });

    // Cleanup stale rows (fire-and-forget — don't block the response)
    const cutoff = new Date(Date.now() - limit.windowMinutes * 2 * 60 * 1000).toISOString();
    svc.from('public_upload_attempts').delete().lt('created_at', cutoff)
      .then(() => {}).catch(() => {});

    return true;
  } catch (err) {
    logger('⚠ Rate limit check failed:', err.message, '— allowing request');
    return true; // Fail open so a DB hiccup doesn't block legitimate reports
  }
}
