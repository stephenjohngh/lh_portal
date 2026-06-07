// src/routes/api/media/upload/+server.js
// POST /api/media/upload
//
// Accepts a file via multipart/form-data and stores it using the configured
// storage provider (STORAGE_PROVIDER env var: google_drive | supabase | onedrive).
//
// Form fields:
//   file        (File/Blob, required)
//   filename    (string)             — desired filename in storage
//   folder_path (JSON string array)  — path segments, e.g. '["inspection-sessions","abc123"]'
//
// Returns:
//   { url, provider, sizeBytes, mimeType }
//
// The caller is responsible for creating the media_attachments row after
// obtaining the entity_id (the URL alone is returned here).
//
// Auth: Bearer token required (uses requireAuth).

import { json }              from '@sveltejs/kit';
import { requireAuth }       from '$lib/server/requireAuth';
import { storageProvider, storageProviderName } from '$lib/server/storage/index.js';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB per photo

export async function POST({ request }) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  // ── Parse form data ─────────────────────────────────────────────────────────
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit` }, { status: 413 });
  }

  const filename    = formData.get('filename') || file.name || `upload_${Date.now()}`;
  const mimeType    = file.type || 'application/octet-stream';
  const folderPath  = JSON.parse(formData.get('folder_path') || '[]');

  // ── Resolve storage destination ─────────────────────────────────────────────
  // ensurePath returns a folder ID (Google Drive) or a path prefix (Supabase/OneDrive).
  // When no folder_path is supplied, ensurePath([]) still returns the root, so we
  // always go through the provider rather than reading process.env inline here.
  let destination;
  try {
    destination = await storageProvider.ensurePath(folderPath);
  } catch (err) {
    return json({ error: `Failed to resolve storage path: ${err.message}` }, { status: 500 });
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  const buffer = Buffer.from(await file.arrayBuffer());
  let result;
  try {
    result = await storageProvider.uploadFile(buffer, filename, mimeType, destination);
  } catch (err) {
    return json({ error: `Storage upload failed: ${err.message}` }, { status: 500 });
  }

  const url = result.webViewUrl ?? result.publicUrl ?? result.fileId ?? '';

  return json({
    url,
    provider:  storageProviderName,
    fileId:    result.fileId   ?? null,
    sizeBytes: buffer.length,
    mimeType,
  });
}
