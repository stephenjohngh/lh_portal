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
//     token:      supabaseAccessToken,   // from supabase.auth.getSession()
//   });
//
// The caller is responsible for persisting the returned URL into the
// media_attachments table (or wherever the URL is stored).
//
/**
 * @param {Blob|File} blob
 * @param {object}   opts
 * @param {string}   opts.filename     desired filename in storage
 * @param {string[]} [opts.folderPath] path segments for folder hierarchy
 * @param {string}   opts.token        Supabase access token (Bearer)
 * @returns {Promise<{ url: string, provider: string, sizeBytes: number, mimeType: string }>}
 */
export async function uploadMedia(blob, { filename, folderPath = [], token }) {
  if (!token) throw new Error('uploadMedia: access token is required');

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
