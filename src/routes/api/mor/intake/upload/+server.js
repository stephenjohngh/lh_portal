// src/routes/api/mor/intake/upload/+server.js
// POST /api/mor/intake/upload
//
// Unauthenticated photo upload endpoint for the public MOR intake form.
// Implements four-layer protection:
//   1. Rate limiting by hashed IP (10 photos per 15 min)
//   2. File size limit (10 MB)
//   3. Magic bytes validation (JPEG / PNG / HEIC / WebP only)
//   4. Google Cloud Vision SafeSearch (adult + violence detection)
//
// Form fields:
//   file        (File/Blob, required)
//   filename    (string)             — desired filename
//   folder_path (JSON string array)  — path segments, e.g. '["mor-public-intake","abc123"]'
//
// Returns: { url, provider, sizeBytes, mimeType }

import { json }              from '@sveltejs/kit';
import { storageProvider, storageProviderName } from '$lib/server/storage/index.js';
import { checkRateLimit }    from '$lib/server/publicRateLimit.js';
import { safeSearchScan }    from '$lib/server/visionScan.js';
import { getLogger }         from '$lib/utils/logger';

const logger = getLogger('mor/intake/upload');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (smaller than authenticated endpoint)

/**
 * Detect image type from magic bytes (first 12 bytes of the file).
 * Returns a MIME type string, or null if the file is not an accepted image.
 */
function detectImageType(buffer) {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 &&
      buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (buffer.length >= 12 &&
      buffer[0]  === 0x52 && buffer[1]  === 0x49 &&
      buffer[2]  === 0x46 && buffer[3]  === 0x46 &&
      buffer[8]  === 0x57 && buffer[9]  === 0x45 &&
      buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';

  // HEIC/HEIF: bytes 4–7 = 'ftyp' (ISO Base Media file format)
  if (buffer.length >= 8) {
    const ftyp = buffer.slice(4, 8).toString('ascii');
    if (ftyp === 'ftyp') return 'image/heic';
  }

  return null; // not an accepted image
}

export async function POST({ request }) {

  // ── Layer 1: Rate limiting ───────────────────────────────────────────────
  const allowed = await checkRateLimit(request, 'photo_upload');
  if (!allowed) {
    logger('Rate limit exceeded for photo_upload');
    return json(
      { error: 'Too many uploads. Please wait a few minutes and try again.' },
      { status: 429 }
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

  // ── Layer 2: File size ────────────────────────────────────────────────────
  if (file.size > MAX_BYTES) {
    return json(
      { error: `Photos must be under ${MAX_BYTES / 1024 / 1024} MB. Please reduce the image size and try again.` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Layer 3: Magic bytes validation ──────────────────────────────────────
  const detectedMime = detectImageType(buffer);
  if (!detectedMime) {
    return json(
      { error: 'Only JPEG, PNG, WebP, and HEIC photos are accepted.' },
      { status: 422 }
    );
  }

  // ── Layer 4: Google Cloud Vision SafeSearch ──────────────────────────────
  const scanResult = await safeSearchScan(buffer);
  if (!scanResult.safe) {
    return json({ error: scanResult.reason }, { status: 422 });
  }

  // ── Upload to storage ────────────────────────────────────────────────────
  const filename   = formData.get('filename') || `upload_${Date.now()}.jpg`;
  const folderPath = JSON.parse(formData.get('folder_path') || '["mor-public-intake"]');

  // Ensure path stays within the mor-public-intake hierarchy
  const safePath = ['mor-public-intake', ...(folderPath.slice(1) ?? [])];

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

  const url = result.webViewUrl ?? result.publicUrl ?? result.fileId ?? '';

  return json({
    url,
    provider:  storageProviderName,
    sizeBytes: buffer.length,
    mimeType:  detectedMime,
  });
}
