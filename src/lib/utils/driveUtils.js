// src/lib/utils/driveUtils.js
// Client-side helpers for Google Drive file URLs.
//
// Google Drive files are stored as raw drive.google.com URLs in
// media_attachments.storage_url.  The portal proxies all Drive file access
// through /api/media/file/{fileId} to avoid cross-origin 403s triggered by
// Drive's hotlink protection (Sec-Fetch-Site: cross-site).
//
// These helpers are shared across every app that reads or DISPLAYS
// media_attachments rows backed by Google Drive storage.
//
// ⛔ DELETION IS NOT HERE ANY MORE. `deleteStorageFiles` lived in this file and
// was Drive-only by construction — it extracted a Drive id and `continue`d on
// anything else, so a Supabase or OneDrive attachment never produced a request
// at all and its file was left behind for ever. Deleting is a provider-routing
// problem, not a Drive one; it lives in $lib/utils/mediaAttachments.js and is
// resolved server-side by $lib/server/storage/storageRef.js.
// PROJECT_STATUS §6hh. ⚠ Do not add a deleter back to this module.
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
