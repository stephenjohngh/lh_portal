// src/lib/apps/dossier/utils/publicationPassphrase.js
// Hashing and checking a publication's optional passphrase.
//
// ── Why this is not the same mechanism as the token ──────────────────────────
// The token is 32 uniformly random bytes, so SHA-256 is exactly right for it:
// there is nothing to brute-force, and a slow KDF would tax every request for
// no gain. A passphrase is human-chosen, low-entropy and often reused, so it
// gets a deliberately slow KDF and a tight rate limit behind it. Using one
// mechanism for both would be wrong in one direction or the other.
//
// ── Why PBKDF2 rather than scrypt ────────────────────────────────────────────
// The author's browser hashes at publish time and the server checks at unlock
// time. scrypt exists only in Node, so it would have forced the plaintext
// passphrase through an extra endpoint purely to be hashed. PBKDF2 is in Web
// Crypto, which is native in browsers AND in Node 19+ — the same reasoning that
// put morVerificationCode on Web Crypto. One implementation, both sides, and
// the passphrase never travels except when it is actually being answered.
//
// 600,000 iterations of PBKDF2-SHA256 is the current OWASP guidance. It costs
// a few hundred milliseconds per unlock attempt, which is the point, and is
// paid at most ten times per quarter-hour because of the rate limit.

const ITERATIONS = 600_000;
const KEY_BITS   = 256;

const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');

/** @param {string} hex */
function fromHex(hex) {
  const clean = String(hex ?? '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

async function derive(passphrase, saltHex) {
  const key = await globalThis.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(passphrase)), 'PBKDF2', false, ['deriveBits']);

  return globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: ITERATIONS, hash: 'SHA-256' },
    key, KEY_BITS);
}

/**
 * Hash a passphrase for storage, with a fresh salt.
 * @returns {Promise<{ hash: string, salt: string }>}
 */
export async function hashPassphrase(passphrase) {
  const saltBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(saltBytes);
  const salt = toHex(saltBytes);
  return { hash: toHex(await derive(passphrase, salt)), salt };
}

/**
 * Check a passphrase against a stored hash.
 *
 * Constant-time, and **false for anything missing** — a publication with no
 * passphrase must never be unlockable by supplying an empty one. That is the
 * shape of bug that turns an optional factor into no factor at all.
 */
export async function verifyPassphrase(passphrase, hash, salt) {
  if (!passphrase || !hash || !salt) return false;
  const computed = toHex(await derive(passphrase, salt));
  return safeEqualHex(computed, hash);
}

/** Compare two hex digests without leaking where they diverge. */
export function safeEqualHex(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** True when this publication asks for a passphrase at all. */
export function needsPassphrase(publication) {
  return Boolean(publication?.passphrase_hash && publication?.passphrase_salt);
}
