// src/lib/utils/morVerificationCode.js
// Verification-code helpers used by Phase 2b (resident status lookup).
//
// The code is a 6-character token from a 31-symbol alphabet, generated at
// case creation, stored on mor_cases.verification_code, and given to the
// reporter alongside the case reference. Together the pair acts as a bearer
// credential for /mor/status.
//
// Alphabet: A-Z + 2-9, minus I, L, O — chars that look like other chars
// when handwritten on a Post-it. 31^6 ≈ 887 million combinations; combined
// with the public-endpoint rate limit (10 lookups per IP per 15 min)
// brute-forcing one case takes thousands of years.
//
// Used in both client (morStore.createCase) and server contexts (public
// intake endpoint). Uses Web Crypto, available natively in browsers and
// in Node 19+ (Netlify Functions and Northflank both run Node 20+).

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars
const LEN      = 6;

/** Generate a fresh 6-character verification code, e.g. "R7PQK2". */
export function generateVerificationCode() {
  const bytes = new Uint8Array(LEN);
  // crypto.getRandomValues is the same API in browsers and Node 19+.
  globalThis.crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < LEN; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/** Format a code for display: "R7PQK2" → "R7P-QK2" (easier to read aloud). */
export function formatVerificationCode(code) {
  if (typeof code !== 'string' || code.length !== LEN) return code ?? '';
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/**
 * Normalise user input — uppercase, strip dashes/spaces, drop unknown chars.
 * Accepts "r7p-qk2", "R7P QK2", "R7PQK2" — all become "R7PQK2".
 * Returns an empty string for anything that can't be coerced to LEN chars.
 */
export function normalizeVerificationCode(input) {
  if (typeof input !== 'string') return '';
  const cleaned = input.toUpperCase().replace(/[^A-Z2-9]/g, '');
  return cleaned.length === LEN ? cleaned : '';
}

/** True if the value is the canonical stored form (uppercase, no separators). */
export function isValidVerificationCode(code) {
  return typeof code === 'string' && new RegExp(`^[${ALPHABET}]{${LEN}}$`).test(code);
}
