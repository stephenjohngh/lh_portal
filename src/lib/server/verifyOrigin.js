// src/lib/server/verifyOrigin.js
// Origin / Referer check for unauthenticated public POST endpoints.
//
// Browsers always send Origin for cross-origin POST requests with a body.
// Same-origin POSTs may omit Origin but include Referer. We accept either,
// and only when both are missing do we reject (which catches scripted
// non-browser callers).
//
// Rejecting here is CSRF defence: the public MOR intake endpoints accept
// no auth token, so without an Origin/Referer check anything could POST
// to them.

import { PUBLIC_SUPABASE_URL } from '$env/static/public';

/**
 * Return true if the request comes from a same-origin browser context.
 *
 * @param {Request} request
 * @param {URL}     url   The endpoint's own URL (from SvelteKit handler args)
 */
export function isSameOrigin(request, url) {
  const expected = url.origin;

  const origin = request.headers.get('origin');
  if (origin) return origin === expected;

  const referer = request.headers.get('referer');
  if (referer) {
    try { return new URL(referer).origin === expected; }
    catch { return false; }
  }

  // Neither header set — treat as suspicious (non-browser caller).
  return false;
}

/**
 * Return true if a storage URL looks like one our configured provider would
 * have returned. Used to validate photo URLs accepted from public submissions.
 *
 * Recognises:
 *   - Google Drive             drive.google.com / *.googleusercontent.com
 *   - OneDrive / SharePoint    *.sharepoint.com / *.onedrive.live.com
 *   - Supabase Storage         <project>.supabase.co/storage/...
 */
export function isTrustedStorageUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;
  let u;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== 'https:') return false;

  const host = u.hostname.toLowerCase();

  // Google Drive
  if (host === 'drive.google.com') return true;
  if (host.endsWith('.googleusercontent.com')) return true;

  // OneDrive / SharePoint
  if (host.endsWith('.sharepoint.com')) return true;
  if (host.endsWith('.onedrive.live.com')) return true;
  if (host === '1drv.ms') return true;

  // Supabase Storage — match the configured project host
  try {
    const supaHost = new URL(PUBLIC_SUPABASE_URL).hostname.toLowerCase();
    if (host === supaHost) return true;
  } catch { /* ignore */ }

  return false;
}
