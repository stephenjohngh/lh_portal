// src/lib/utils/mediaUpload.js
// Client-side helper for uploading media files through /api/media/upload.
//
// All photo/file uploads from any app go through this single function.
// The server-side endpoint selects the storage provider (Google Drive,
// Supabase, OneDrive) based on the STORAGE_PROVIDER environment variable.
//
// Usage:
//   import { uploadMedia } from '$lib/utils/mediaUpload';
//
//   const url = await uploadMedia(blob, {
//     filename:   'photo_001.jpg',
//     folderPath: ['inspection-sessions', sessionId],
//   });
//
// The bearer token is read here (authHeaders.js accessToken), not passed in.
//
// The caller is responsible for persisting the returned URL into the
// media_attachments table (or wherever the URL is stored).
//
import { accessToken } from '$lib/utils/authHeaders';

/**
 * @param {Blob|File} blob
 * @param {object}   opts
 * @param {string}   opts.filename     desired filename in storage
 * @param {string[]} [opts.folderPath] path segments for folder hierarchy
 * @returns {Promise<{ url: string, provider: string, sizeBytes: number, mimeType: string }>}
 */
export async function uploadMedia(blob, { filename, folderPath = [] }) {
  const token = await accessToken();
  if (!token) throw new Error('No auth token available for photo upload');

  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('filename',    filename);
  formData.append('folder_path', JSON.stringify(folderPath));

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    let msg = `Upload failed (${response.status})`;
    try { const j = await response.json(); msg = j.error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  return response.json();
  // Returns { url, provider, sizeBytes, mimeType }
}
