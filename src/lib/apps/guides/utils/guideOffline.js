// src/lib/apps/guides/utils/guideOffline.js
// Guides on the device, for a walk with no signal: a saved copy of the guide data (an
// IndexedDB read cache) and the photos (the browser's Cache Storage). Both are deleted at
// logout — wipe.js lists them by name (`lh_guides_offline`, `lh-guide-photos`), because a
// staff-only guide must not outlive the person's session on a shared phone.
//
// Nothing here throws: where IndexedDB or Cache Storage is missing (a private window, a
// test), a save does nothing and a load finds nothing, and the caller falls back to the
// live read, whose failure the screen already reports.

import { makeOpener, writeCache, readCache } from '#lib/offline/outbox.js';
import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';

export const GUIDES_DB = 'lh_guides_offline';
export const PHOTO_CACHE = 'lh-guide-photos';

const open = makeOpener(GUIDES_DB, 1);

/** @param {string} key @param {unknown} bundle */
export async function saveBundle(key, bundle) {
  try { await writeCache(await open(), key, bundle); } catch { /* no offline store here: live reads only */ }
}

/** @param {string} key @returns {Promise<any|null>} */
export async function loadBundle(key) {
  try { return (await readCache(await open(), key))?.data ?? null; } catch { return null; }
}

const hasCaches = () => typeof caches !== 'undefined' && !!caches;

/**
 * Fetch each photo (through the portal's file proxy, with the session) into the photo cache.
 * @param {string[]} urls  stored photo URLs
 * @returns {Promise<{ saved: number, missed: number }>}
 */
export async function cachePhotos(urls) {
  if (!hasCaches()) return { saved: 0, missed: urls.length };
  let saved = 0, missed = 0;
  const cache = await caches.open(PHOTO_CACHE);
  for (const u of urls) {
    try {
      const src = normalisePhotoUrl(u);
      const res = await fetch(src, { credentials: 'same-origin' });
      if (!res.ok) { missed++; continue; }
      await cache.put(u, res);                       // keyed by the stored URL, which the guide data carries
      saved++;
    } catch { missed++; }
  }
  return { saved, missed };
}

/**
 * A URL the browser can show for a photo held on the device, or null when it is not there.
 * @param {string} url the stored photo URL @returns {Promise<string|null>}
 */
export async function cachedPhotoUrl(url) {
  if (!hasCaches()) return null;
  try {
    const hit = await (await caches.open(PHOTO_CACHE)).match(url);
    return hit ? URL.createObjectURL(await hit.blob()) : null;
  } catch { return null; }
}
