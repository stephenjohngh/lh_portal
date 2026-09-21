// src/lib/server/storage/storageRef.js
//
// Resolve a stored media URL to (which provider owns it, what to call it).
//
// ⛔ THE FAULT THIS EXISTS TO FIX. `storageProvider` is a single global chosen
// by STORAGE_PROVIDER, and deletion used it for every file. But a file's
// provider is a property of WHEN IT WAS WRITTEN, not of today's configuration —
// so the moment the variable changed, every file written under the old provider
// became undeletable. That is not hypothetical: 30 real files (24 Drive, 6 in a
// public Supabase bucket) were stranded exactly that way and had to be removed
// by a one-off script. PROJECT_STATUS §6hh.
//
// ⭐ TWO SOURCES OF TRUTH, IN THIS ORDER, AND THE SECOND IS WHY LEGACY ROWS WORK:
//   1. `media_attachments.storage_provider`, recorded at upload time. Authoritative.
//   2. The URL's own shape. Self-describing, and the only thing available for
//      every row written before the column was populated — which is all of them.
// Declared-but-unrecognised falls back to inference rather than failing: a typo
// in a column must not make a file permanently undeletable, which is the exact
// failure mode being removed.
//
// ⚠ NO IMPORTS, deliberately — pure string work, so it is unit-testable without
// $env, a provider, or a network.

/** Provider names, matching both the PROVIDERS registry keys and provider.name. */
export const STORAGE_PROVIDERS = ['google_drive', 'onedrive', 'supabase'];

// ⛔ BUCKETS MEDIA DELETION MUST NEVER TOUCH. `plan-images` holds the floor-plan
// schematics — they are NOT media attachments, and nothing in media_attachments
// should ever name one. A denylist rather than an allowlist so a future media
// bucket works without being added here, while the one bucket whose loss would
// be unrecoverable stays protected. ⚠ This is not paranoia: the orphan cleanup
// deleted by a regex over a URL, and the schematics sat one capture group away.
export const PROTECTED_BUCKETS = ['plan-images'];

/**
 * Google Drive file id from a raw storage_url or webViewLink.
 * Mirrors extractDriveFileId in $lib/utils/driveUtils.js — that one is the
 * client's display-side copy; this is the server's deletion-side copy, and they
 * are deliberately separate modules because one may not import $lib/server.
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function driveFileId(url) {
  if (!url) return null;
  return url.match(/drive\.google\.com\/(?:uc\?.*?id=|file\/d\/)([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

/**
 * Supabase Storage object from a public, authenticated or signed object URL.
 *   /storage/v1/object/public/<bucket>/<path>
 *   /storage/v1/object/sign/<bucket>/<path>?token=…
 *   /storage/v1/object/<bucket>/<path>
 * @param {string|null|undefined} url
 * @returns {{ bucket: string, path: string }|null}
 */
export function supabaseObjectRef(url) {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?([^/?#]+)\/([^?#]+)/);
  if (!m) return null;
  let path;
  try { path = decodeURIComponent(m[2]); } catch { path = m[2]; }
  return { bucket: m[1], path };
}

/**
 * What must be done to delete this file, and by whom.
 *
 * @param {string|null|undefined} url        media_attachments.storage_url
 * @param {string|null|undefined} [declared] media_attachments.storage_provider
 * @returns {{ provider: string|null, ref: string|null, bucket: string|null, reason: string|null }}
 *   `ref` non-null means it can be deleted. `reason` says why not when it cannot,
 *   and is written to be shown to a person rather than logged and forgotten.
 */
export function resolveStorageRef(url, declared = null) {
  const fail = (provider, reason) => ({ provider, ref: null, bucket: null, reason });
  if (!url) return fail(null, 'No storage URL recorded, so there is nothing to address.');

  const drive = driveFileId(url);
  const sb    = supabaseObjectRef(url);
  const stated = STORAGE_PROVIDERS.includes(/** @type {string} */ (declared)) ? declared : null;

  // Inference, used when nothing is declared and as the tie-break when what IS
  // declared has no ref in this URL (a row mislabelled at write time).
  const inferred = drive ? 'google_drive' : sb ? 'supabase' : null;
  const provider = (stated && ((stated === 'google_drive' && drive) || (stated === 'supabase' && sb)))
    ? stated
    : (inferred ?? stated);

  if (provider === 'google_drive') {
    return drive
      ? { provider, ref: drive, bucket: null, reason: null }
      : fail(provider, 'Recorded as Google Drive, but the URL carries no Drive file id.');
  }

  if (provider === 'supabase') {
    if (!sb) return fail(provider, 'Recorded as Supabase Storage, but the URL is not an object URL.');
    if (PROTECTED_BUCKETS.includes(sb.bucket)) {
      return fail(provider,
        `Refusing to delete from the protected "${sb.bucket}" bucket — it holds schematics, `
        + 'not media attachments. A media row pointing here is itself the bug.');
    }
    return { provider, ref: sb.path, bucket: sb.bucket, reason: null };
  }

  // ⚠ OneDrive stores a SharePoint webUrl, which carries no item id — so an
  // item cannot be addressed from what we keep, and never could be. Stated
  // plainly rather than silently skipped, which is how the Drive-only deleter
  // hid this for as long as it did. Deleting these needs a provider_file_id
  // column on media_attachments; OneDrive is not in use, so it is not built.
  if (provider === 'onedrive') {
    return fail(provider,
      'OneDrive files cannot be addressed from a stored webUrl — media_attachments '
      + 'has no provider_file_id. Not supported; see PROJECT_STATUS §6 item 9.');
  }

  return fail(null, 'Unrecognised storage URL — no provider owns this shape.');
}
