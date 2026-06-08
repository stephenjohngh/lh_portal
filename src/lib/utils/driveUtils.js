// src/lib/utils/driveUtils.js
// Client-side helpers for Google Drive file URLs.
//
// Google Drive files are stored as raw drive.google.com URLs in
// media_attachments.storage_url.  The portal proxies all Drive file access
// through /api/media/file/{fileId} to avoid cross-origin 403s triggered by
// Drive's hotlink protection (Sec-Fetch-Site: cross-site).
//
// These three helpers are shared across every app that reads, displays, or
// deletes media_attachments rows backed by Google Drive storage.
//
// Non-Drive storage_url values (Supabase public URLs, OneDrive, etc.) pass
// through unchanged — the helpers are safe to call on any URL.

/**
 * Extract a Google Drive file ID from a raw storage_url or webViewLink.
 *
 * Handles both URL formats the Drive API can return:
 *   https://drive.google.com/uc?export=view&id={fileId}   ← stored in media_attachments
 *   https://drive.google.com/file/d/{fileId}/view
 *
 * Returns null for non-Drive URLs or empty input.
 *
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function extractDriveFileId(url) {
  if (!url) return null;
  const m = url.match(/drive\.google\.com\/(?:uc\?.*?id=|file\/d\/)([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

/**
 * Convert a raw Drive storage_url to the portal's own proxy URL for <img> display.
 *
 * Drive direct URLs return 403 when used as <img src> cross-origin.
 * Routing through /api/media/file/{fileId} makes it same-origin.
 * Non-Drive URLs (Supabase, etc.) are returned unchanged.
 *
 * @param {string|null|undefined} url
 * @returns {string|null|undefined}
 */
export function normalisePhotoUrl(url) {
  if (!url) return url;
  const fileId = extractDriveFileId(url);
  if (fileId) return `/api/media/file/${fileId}`;
  return url;
}

/**
 * Best-effort deletion of Drive storage files via the portal's own
 * DELETE /api/media/file/{fileId} endpoint.
 *
 * Failures are silently swallowed — storage cleanup must never block DB cleanup.
 * Non-Drive URLs (no extractable file ID) are silently skipped.
 *
 * Call this BEFORE deleting the media_attachments DB rows so the URLs are
 * still available to parse.
 *
 * @param {string[]}      urls   — raw storage_url values from media_attachments
 * @param {string|null}   token  — Supabase Bearer token (supabase.auth.getSession())
 */
export async function deleteStorageFiles(urls, token) {
  if (!token || !urls?.length) return;
  for (const url of urls) {
    const fileId = extractDriveFileId(url);
    if (!fileId) continue;   // non-Drive provider — skip
    try {
      await fetch(`/api/media/file/${fileId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Network error — DB cleanup must not be blocked
    }
  }
}
