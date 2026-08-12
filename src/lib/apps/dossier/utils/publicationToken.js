// src/lib/apps/dossier/utils/publicationToken.js
// The link's secret — generation, hashing and comparison.
//
// Runs in BOTH contexts: the browser generates a token when publishing, the
// server hashes an incoming one on every reader request. So it uses Web Crypto
// only, which is native in browsers and in Node 19+ (Netlify Functions and
// Northflank both run Node 20+) — the same reasoning as morVerificationCode.
//
// ── Why the token is hashed at rest ──────────────────────────────────────────
// The obvious objection is that anyone who can read dossier_publications also
// has the snapshot in the next column, so what does hashing buy? It buys
// protection against the token leaking ALONE — a log line, a partial export, a
// `select id, title, token`. That is a real and common failure, and the fact
// that the row is already sensitive is an argument against weakening it, not
// for. The cost is that the link cannot be re-shown: it appears once at
// creation, like an API key, with Regenerate as the recovery path.
//
// ── Why a fast hash here and a slow one for passphrases ──────────────────────
// This token is 32 uniformly random bytes. There is nothing to brute-force, so
// SHA-256 is exactly right and a slow KDF would only cost every request. A
// passphrase is human-chosen and low-entropy, so it gets scrypt — see
// $lib/server/publicationPassphrase.js. Using one mechanism for both would be
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
 * Compare two hex digests without leaking where they diverge.
 *
 * The lookup is by hash and the token is uniformly random, so a timing signal
 * here is not a practical attack — but a constant-time compare costs nothing
 * and removes the need for anyone to reason about that again.
 */
export function safeEqual(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
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
