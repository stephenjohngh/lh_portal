// src/lib/server/publicationPassphrase.js
// The GRANT half of passphrase access — server-only.
//
// Hashing and checking the passphrase itself lives in
// $lib/apps/dossier/utils/publicationPassphrase.js, because the author's
// browser has to hash one at publish time. What is here is the thing only a
// server can do: mint and verify a signed grant.
//
// ── Why a grant rather than re-asking ────────────────────────────────────────
// A recipient reading a pack loads a page and then a dozen files. Prompting per
// request is unusable, and carrying the passphrase in every URL would put it in
// server logs and in browser history. So a successful entry mints a
// short-lived, HttpOnly cookie — scoped to ONE publication, signed, carrying no
// secret and no identity. It says only "this browser answered for publication
// X, until Y".

import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';
import { needsPassphrase } from '$lib/apps/dossier/utils/publicationPassphrase.js';

export { needsPassphrase };

/** How long a grant lasts. Long enough to read a pack, short enough to matter. */
export const GRANT_TTL_MS = 4 * 60 * 60 * 1000;   // 4 hours

/** The cookie a granted reader carries. Per publication, never portal-wide. */
export function grantCookieName(publicationId) {
  return `dossier_pack_${String(publicationId).replace(/[^A-Za-z0-9]/g, '')}`;
}

/**
 * The key grants are signed with.
 *
 * A dedicated secret if one is configured; otherwise the service-role key,
 * which this process already holds and never exposes. The fallback keeps the
 * feature working without adding a mandatory environment variable to every
 * deployment — but DOSSIER_LINK_SECRET is preferable, because rotating it then
 * invalidates outstanding grants without disturbing database access.
 */
function signingKey() {
  return env.DOSSIER_LINK_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/**
 * Mint a grant for one publication. The value is `<expiry>.<hmac>`.
 */
export function mintGrant(publicationId, now = Date.now()) {
  const expiry = now + GRANT_TTL_MS;
  const mac = createHmac('sha256', signingKey())
    .update(`${publicationId}.${expiry}`).digest('hex');
  return `${expiry}.${mac}`;
}

/**
 * Is this grant good for this publication, right now?
 *
 * The publication id is bound INTO the signature, so a grant minted for one
 * pack cannot be replayed against another. That scoping is the whole point:
 * answering for one pack must not open a second.
 */
export function verifyGrant(value, publicationId, now = Date.now()) {
  if (typeof value !== 'string') return false;
  const [expiryText, mac] = value.split('.');
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || !mac) return false;
  if (now >= expiry) return false;

  const expected = createHmac('sha256', signingKey())
    .update(`${publicationId}.${expiry}`).digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Has this request already answered for this publication?
 *
 * Returns true when there is nothing to answer, so callers can gate on this
 * unconditionally rather than remembering to check `needsPassphrase` first.
 *
 * @param {{ get(name: string): string|undefined }} cookies - SvelteKit's cookies
 */
export function hasGrant(cookies, publication, now = Date.now()) {
  if (!needsPassphrase(publication)) return true;
  return verifyGrant(cookies?.get?.(grantCookieName(publication.id)), publication.id, now);
}

/**
 * Cookie options for a minted grant.
 *
 * `secure` follows the ACTUAL protocol rather than being hard-coded. In
 * production (Netlify, Northflank) that is https, and a passphrase grant has no
 * business travelling in the clear. But a hard-coded `true` is silently fatal
 * over plain http from anything other than localhost — the browser discards the
 * cookie, the page re-locks, and the recipient sees a correct passphrase
 * rejected with no error at all. Reading the request's own protocol keeps the
 * production guarantee and makes LAN testing work.
 *
 * @param {URL} [url] - the request URL; omit only where no request exists
 */
export function grantCookieOptions(url) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url ? url.protocol === 'https:' : true,
    maxAge: Math.floor(GRANT_TTL_MS / 1000),
  };
}
