// src/lib/apps/dossier/utils/publicationToken.js
// The link's secret — generation, hashing and comparison.
//
// Runs in BOTH contexts: the browser generates a token when publishing, the
// server hashes an incoming one on every reader request. So it uses Web Crypto
// only, which is native in browsers and in Node 19+ (Netlify Functions and
// Northflank both run Node 20+) — the same reasoning as caseVerificationCode.
//
// ── The token is kept in the clear as well as hashed (migration 277) ─────────
// It used to be hashed only, shown once like an API key. That protected little:
// anyone who can read dossier_publications also has the snapshot (or the live
// pack) beside it, and the cost was real — a lost link could only be replaced.
// So the row now carries `token` too, behind the same RLS (the pack's owner or an
// admin), and the author can show or copy it at any time (each is audited).
// `token_hash` remains because it is how the public reader finds a publication
// without the token ever being a query parameter. The PASSPHRASE is different and
// stays hashed: it is human-chosen, often reused elsewhere, and never needs reading
// back.
//
// ── Why a fast hash here and a slow one for passphrases ──────────────────────
// This token is 32 uniformly random bytes. There is nothing to brute-force, so
// SHA-256 is exactly right and a slow KDF would only cost every request. A
// passphrase is human-chosen and low-entropy, so it gets scrypt — see
// #lib/server/publicationPassphrase.js. Using one mechanism for both would be
// wrong in one direction or the other.

/** 32 bytes ≈ 256 bits of entropy, rendered as 43 base64url characters. */
const TOKEN_BYTES = 32;

/** How much of the token is kept in the clear so the author can identify a link. */
export const TOKEN_PREFIX_LENGTH = 8;

/** base64url — safe in a path segment, no padding, no percent-encoding. */
function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A fresh publication token. Never stored — hashed immediately, shown once. */
export function generateToken() {
  const bytes = new Uint8Array(TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * Shape check for an incoming token.
 *
 * Applied before touching the database, so a malformed path segment costs a
 * regex rather than a query — and so the reader endpoint has one obvious place
 * where "what can arrive here" is defined.
 */
export function isWellFormedToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{40,50}$/.test(token);
}

/** SHA-256 hex of a token. The only form that reaches the database. */
export async function hashToken(token) {
  const data = new TextEncoder().encode(String(token ?? ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** The identifiable head of a token, for the author's list. */
export function tokenPrefix(token) {
  return String(token ?? '').slice(0, TOKEN_PREFIX_LENGTH);
}

/**
 * The link the author copies and sends.
 *
 * @param {string} origin - e.g. https://portal.example.com
 * @param {string} token
 */
export function publicationUrl(origin, token) {
  return `${String(origin ?? '').replace(/\/+$/, '')}/pack/${token}`;
}
