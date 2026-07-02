// src/lib/server/urlSignature.js
// HMAC signatures for storage URLs handed to UNAUTHENTICATED clients (M4,
// 2026-07-02 security review).
//
// Problem: the public MOR intake is two requests — upload a photo (which runs
// the Vision SafeSearch scan) and later submit the case with the photo URLs.
// The submit endpoint used to accept any URL whose HOST looked like a storage
// provider (drive.google.com, *.googleusercontent.com, …), so a submitter could
// skip our upload — and its content scan — entirely and attach any Google-hosted
// image to a case that staff then view.
//
// Fix: the upload endpoint signs each URL it returns; the submit endpoint only
// accepts URLs carrying a valid signature. Only files that actually went
// through our pipeline (size cap, magic-bytes check, SafeSearch) can be
// attached. The key is derived from the service-role key — already secret,
// already server-only, no new env var. Signatures don't expire: a signed URL is
// just "this exact URL came out of our uploader", which stays true.

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

// Domain-separated key: not the raw service key, and useless for anything else.
function key() {
  return createHash('sha256')
    .update('lh-portal:public-upload-url:' + (env.SUPABASE_SERVICE_ROLE_KEY ?? ''))
    .digest();
}

/** Sign a storage URL. Returns a hex HMAC to hand back alongside the URL. */
export function signUrl(url) {
  return createHmac('sha256', key()).update(String(url)).digest('hex');
}

/** Verify a URL + signature pair (constant-time). */
export function verifyUrlSignature(url, sig) {
  if (typeof url !== 'string' || typeof sig !== 'string' || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = Buffer.from(signUrl(url), 'hex');
  const supplied = Buffer.from(sig, 'hex');
  return timingSafeEqual(expected, supplied);
}
