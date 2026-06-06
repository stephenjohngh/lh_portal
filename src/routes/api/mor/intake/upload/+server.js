// src/routes/api/mor/intake/upload/+server.js
// POST /api/mor/intake/upload
//
// Unauthenticated photo upload endpoint for the public MOR intake form.
// Implements five-layer protection:
//   1. Same-origin check        (CSRF defence)
//   2. Rate limiting by hashed IP (10 photos per 15 min)
//   3. File size limit (10 MB) — pre-checked via Content-Length
//   4. Magic bytes + brand validation (JPEG / PNG / HEIC / WebP only)
//   5. Google Cloud Vision SafeSearch (adult + violence detection)
//
// Form fields:
//   file        (File/Blob, required)
//   filename    (string)             — desired filename (sanitised here)
//   folder_path (JSON string array)  — path segments under mor-public-intake
//
// Returns: { url, provider, sizeBytes, mimeType }

import { json }                  from '@sveltejs/kit';
import { storageProvider,
         storageProviderName }   from '$lib/server/storage/index.js';
import { checkRateLimit }        from '$lib/server/publicRateLimit.js';
import { safeSearchScan }        from '$lib/server/visionScan.js';
import { isSameOrigin }          from '$lib/server/verifyOrigin.js';
import { getLogger }             from '$lib/utils/logger';

const logger = getLogger('mor/intake/upload');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// HEIC/HEIF brands per ISO/IEC 23008-12. We accept the common image brands
// and reject MP4/MOV (which also start with 'ftyp' but use brands like
// 'isom', 'mp42', 'qt  ').
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis']);

// Allowed folder-segment characters — defence against path traversal /
// provider-specific separators.
const SAFE_SEGMENT = /^[A-Za-z0-9._\-]+$/;

/**
 * Detect image type from magic bytes (first 12 bytes of the file).
 * Returns a MIME type string, or null if the file is not an accepted image.
 */
function detectImageType(buffer) {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 &&
      buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (buffer[0]  === 0x52 && buffer[1]  === 0x49 &&
      buffer[2]  === 0x46 && buffer[3]  === 0x46 &&
      buffer[8]  === 0x57 && buffer[9]  === 0x45 &&
      buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';

  // HEIC/HEIF: bytes 4–7 = 'ftyp', bytes 8–11 = brand (must be HEIC brand —
  // raw 'ftyp' match would also accept MP4/MOV).
  if (buffer.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.slice(8, 12).toString('ascii').toLowerCase();
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
  }

  return null;
}

/** Sanitise a filename for storage — keeps it short and safe across providers. */
function sanitiseFilename(name) {
  if (typeof name !== 'string' || name.length === 0) return `upload_${Date.now()}.jpg`;
  // Strip path components, keep extension if present.
  const base = name.replace(/^.*[\\/]/, '');
  const safe = base.replace(/[^A-Za-z0-9._\-]/g, '_').slice(0, 80);
  return safe || `upload_${Date.now()}.jpg`;
}

/** Parse folder_path and constrain it under mor-public-intake. */
function safeFolderPath(rawJson) {
  let parsed;
  try { parsed = JSON.parse(rawJson || '[]'); }
  catch { return null; }
  if (!Array.isArray(parsed)) return null;

  // Drop the first segment (the client is expected to send 'mor-public-intake'
  // but we don't trust it) and validate the rest.
  const tail = parsed.slice(1).filter(s => typeof s === 'string' && SAFE_SEGMENT.test(s));
  // Cap depth to prevent absurd hierarchies.
  return ['mor-public-intake', ...tail.slice(0, 3)];
}

export async function POST({ request, url }) {

  // ── Layer 1: Same-origin / Referer check ────────────────────────────────
  if (!isSameOrigin(request, url)) {
    logger('Cross-origin upload rejected');
    return json({ error: 'Cross-origin requests are not permitted.' }, { status: 403 });
  }

  // ── Layer 2: Rate limiting ───────────────────────────────────────────────
  const allowed = await checkRateLimit(request, 'photo_upload');
  if (!allowed) {
    logger('Rate limit exceeded for photo_upload');
    return json(
      { error: 'Too many uploads. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  // ── Layer 3a: Content-Length pre-check ───────────────────────────────────
  // Reject obvious oversize before buffering the body.
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES + 64 * 1024) {
    return json(
      { error: `Photos must be under ${MAX_BYTES / 1024 / 1024} MB. Please reduce the image size and try again.` },
      { status: 413 }
    );
  }

  // ── Parse form data ──────────────────────────────────────────────────────
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid request' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return json({ error: 'No file provided' }, { status: 400 });
  }

  // ── Layer 3b: Final file size check ──────────────────────────────────────
  if (file.size > MAX_BYTES) {
    return json(
      { error: `Photos must be under ${MAX_BYTES / 1024 / 1024} MB. Please reduce the image size and try again.` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Layer 4: Magic bytes + brand validation ──────────────────────────────
  const detectedMime = detectImageType(buffer);
  if (!detectedMime) {
    return json(
      { error: 'Only JPEG, PNG, WebP, and HEIC photos are accepted.' },
      { status: 422 }
    );
  }

  // ── Layer 5: Google Cloud Vision SafeSearch ──────────────────────────────
  const scanResult = await safeSearchScan(buffer);
  if (!scanResult.safe) {
    return json({ error: scanResult.reason }, { status: 422 });
  }

  // ── Resolve safe path + filename ─────────────────────────────────────────
  const safePath = safeFolderPath(formData.get('folder_path'));
  if (!safePath) {
    return json({ error: 'Invalid folder path' }, { status: 400 });
  }
  const filename = sanitiseFilename(formData.get('filename') ?? '');

  // ── Upload to storage ────────────────────────────────────────────────────
  let destination;
  try {
    destination = await storageProvider.ensurePath(safePath);
  } catch (err) {
    logger('❌ ensurePath failed:', err.message);
    return json({ error: 'Storage unavailable. Please try again.' }, { status: 500 });
  }

  let result;
  try {
    result = await storageProvider.uploadFile(buffer, filename, detectedMime, destination);
  } catch (err) {
    logger('❌ Upload failed:', err.message);
    return json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }

  const uploadUrl = result.webViewUrl ?? result.publicUrl ?? result.fileId ?? '';

  return json({
    url:       uploadUrl,
    provider:  storageProviderName,
    sizeBytes: buffer.length,
    mimeType:  detectedMime,
  });
}
