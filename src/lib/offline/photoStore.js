// src/lib/offline/photoStore.js
//
// Photos held on the phone until the queued op that names them has synced —
// shared by the apps that work without a signal (2026-10-17). Lifted unchanged
// from the Inspection app's offlineQueue.js (same store name, same key), so a
// walk's photos already waiting on a phone are untouched; Parking's
// unauthorised-parking sightings use it too.
//
// A record: { photoId, blob, filename, folderPath, uploaded, url, provider,
//             createdAt, ...the app's own fields (Inspection: inspectionId) }
// Every function takes an IdbHandle (or the in-memory one tests use).

import { DAY_MS } from '#lib/utils/dates.js';

export const STORE_PHOTOS = 'photos';

/** Create the photo store (call from an app's upgrade function). @param {IDBDatabase} db */
export function upgradePhotoSchema(db) {
  if (!db.objectStoreNames.contains(STORE_PHOTOS)) db.createObjectStore(STORE_PHOTOS, { keyPath: 'photoId' });
}

/**
 * Stash a captured photo Blob.
 * @param {object} handle
 * @param {{ photoId: string, inspectionId: string, blob: Blob, filename: string,
 *          folderPath: string[], uploaded?: boolean, url?: string|null }} photo
 */
export async function putPhoto(handle, photo) {
  await handle.put(STORE_PHOTOS, { uploaded: false, url: null, createdAt: Date.now(), ...photo });
  return photo;
}

/**
 * A photo whose op has synced: drop the image, keep what it became.
 *
 * ⭐ The record stays, without its blob, so a later re-inspect that REMOVES this
 * photo (it knows it only by photoId) can still name the file to take off —
 * the url is learned only when the sync uploads it. A photo never uploaded
 * has nothing to remember and goes. Cleared after RETIRED_PHOTO_MS by
 * pruneRetiredPhotos. (2026-10-04, §6ccc item 7: re-inspects keep earlier photos.)
 */
export async function retirePhoto(handle, photoId) {
  const p = await handle.get(STORE_PHOTOS, photoId);
  if (!p) return;
  if (!p.uploaded || !p.url) { await deletePhoto(handle, photoId); return; }
  await handle.put(STORE_PHOTOS, { ...p, blob: null, retiredAt: Date.now() });
}

/** How long a retired photo's url is remembered — a walk is done well within it. */
export const RETIRED_PHOTO_MS = 14 * DAY_MS;

/** Forget retired photos older than `maxAgeMs`. */
export async function pruneRetiredPhotos(handle, maxAgeMs = RETIRED_PHOTO_MS, now = Date.now()) {
  for (const p of await handle.getAll(STORE_PHOTOS)) {
    if (p.blob == null && p.retiredAt != null && now - p.retiredAt > maxAgeMs) await deletePhoto(handle, p.photoId);
  }
}

export function getPhoto(handle, photoId) {
  return handle.get(STORE_PHOTOS, photoId);
}

export function deletePhoto(handle, photoId) {
  return handle.delete(STORE_PHOTOS, photoId);
}

/** Every held photo whose `field` is `value` (Inspection: by inspectionId). */
export async function listPhotosWhere(handle, field, value) {
  const all = await handle.getAll(STORE_PHOTOS);
  return all.filter(p => p[field] === value);
}

/**
 * Mark a photo uploaded (idempotency: a retry then skips the re-upload).
 *
 * ⚠ `provider` is stored alongside the url because a replay skips the upload
 * and reuses what is recorded here — so without it, a photo that crossed a
 * crash would land in media_attachments with no provider and be deletable only
 * by inference. PROJECT_STATUS §6hh.
 */
export async function markPhotoUploaded(handle, photoId, url, provider = null) {
  const p = await handle.get(STORE_PHOTOS, photoId);
  if (!p) return null;
  const updated = { ...p, uploaded: true, url, provider };
  await handle.put(STORE_PHOTOS, updated);
  return updated;
}
