// src/lib/apps/inspection/utils/offlineQueue.js
//
// The Inspection app's durable offline outbox. The ops queue and read cache are
// the shared `#lib/offline/outbox.js`; photos and the walk's op rules are
// Inspection's own, here. It holds three kinds of thing:
//
//   • ops       — a FIFO of server operations still to sync (seq autoincrement).
//   • photos    — captured photo Blobs waiting to upload (keyed by photoId).
//   • readcache — the last-good `load()` payload, so a walk can start offline.
//
// Every function takes an `IdbHandle` (or the in-memory equivalent used in tests)
// as its first argument, so the logic is testable without a real IndexedDB and
// the same code drives the browser store via openQueue(). The store schema and
// the op vocabulary live here; the syncing logic lives in `inspectionSync.js` /
// `syncRunner.js`.
//
// Op model — one record per pending server operation:
//   { seq, type, sessionId, payload, status, attempts, lastError, createdAt }
//   status ∈ 'pending' | 'syncing' | 'error' | 'done'
// Op types (see Inspection_Offline_Walk_Design.md §4.3):
//   'session_create'   payload: { row }                    — walk_sessions insert
//   'inspection_save'  payload: { row, isUpdate, purgeInspectionId, photoIds, statusPatch }
//   'session_complete' payload: { sessionId, notes, inspectedCount }

import { isIdbAvailable } from '#lib/utils/idb.js';
import { DAY_MS } from '#lib/utils/dates.js';
import {
  STORE_OPS, STORE_CACHE, OP_PENDING, OP_SYNCING, OP_ERROR, OP_DONE,
  upgradeOutboxSchema, makeOpener, enqueue, listOps, listUnsyncedOps, setOpStatus, deleteOp, pruneDone,
  writeCache, readCache, summarizeOps, pickNextOp,
} from '#lib/offline/outbox.js';

// The generic outbox lives in #lib/offline/outbox.js (shared with Parking (M),
// 2026-10-10); it is re-exported here so this file stays the one Inspection imports.
export {
  STORE_OPS, STORE_CACHE, OP_PENDING, OP_SYNCING, OP_ERROR, OP_DONE,
  enqueue, listOps, listUnsyncedOps, setOpStatus, deleteOp, pruneDone,
  writeCache, readCache, summarizeOps, pickNextOp,
};

export const DB_NAME    = 'lh_inspection_offline';
export const DB_VERSION = 1;

export const STORE_PHOTOS = 'photos';

/** Create the object stores on first open / version bump. */
export function upgradeSchema(db) {
  upgradeOutboxSchema(db);
  if (!db.objectStoreNames.contains(STORE_PHOTOS)) db.createObjectStore(STORE_PHOTOS, { keyPath: 'photoId' });
}

/**
 * Open the shared offline DB (memoised). Throws under SSR / no-IndexedDB — call
 * isOfflineAvailable() first at the boundary.
 */
export const openQueue = makeOpener(DB_NAME, DB_VERSION, upgradeSchema);

/** Whether the offline queue can be used here (browser with IndexedDB). */
export function isOfflineAvailable() {
  return isIdbAvailable();
}

// -- Ops -----------------------------------------------------------------------

/**
 * Enqueue an `inspection_save`, COALESCING with an existing not-yet-synced op for
 * the same inspection id: a re-inspect before the first save has synced replaces
 * the queued payload in place (keeping its seq, so walk order is preserved) rather
 * than piling a second op behind it. Only 'pending'/'error' ops coalesce — an op
 * mid-flight ('syncing') or already 'done' gets a fresh op, which the by-id upsert
 * converges anyway.
 * @param {object} handle
 * @param {object} payload  { row, isUpdate, purgeInspectionId, photoIds, statusPatch }
 */
export async function enqueueInspectionSave(handle, payload) {
  const inspectionId = payload?.row?.id;
  const ops = await listOps(handle);
  const existing = ops.find(o =>
    o.type === 'inspection_save' &&
    (o.status === OP_PENDING || o.status === OP_ERROR) &&
    o.payload?.row?.id === inspectionId
  );
  if (existing) {
    // A re-inspect carries the earlier photos the inspector KEPT in its
    // photoIds, so a photo the superseded op referenced and this one does not
    // was removed. Free its blob — and if it had already been uploaded (a
    // partial sync), remember its url so the sync takes the attachment off too.
    const keep = new Set(payload?.photoIds ?? []);
    const removeUrls = new Set([...(existing.payload?.removePhotoUrls ?? []), ...(payload?.removePhotoUrls ?? [])]);
    for (const pid of (existing.payload?.photoIds ?? [])) {
      if (keep.has(pid)) continue;
      const p = await getPhoto(handle, pid);
      if (p?.uploaded && p.url) removeUrls.add(p.url);
      await deletePhoto(handle, pid);
    }
    const merged = {
      ...payload,
      removePhotoUrls: [...removeUrls],
      removePhotoIds:  [...new Set([...(existing.payload?.removePhotoIds ?? []), ...(payload?.removePhotoIds ?? [])])],
    };
    const updated = { ...existing, payload: merged, status: OP_PENDING, attempts: 0, lastError: null };
    await handle.put(STORE_OPS, updated);
    return updated;
  }
  return enqueue(handle, {
    type:      'inspection_save',
    sessionId: payload?.row?.walk_session_id ?? null,
    payload,
  });
}

// -- Outbox reads for resume / session listing (P4) ----------------------------
// These let the store reconstruct a session that was started/walked offline and
// never synced: its walk_sessions row and its inspections live only in the queue.

/** walk_sessions rows from un-synced session_create ops. */
export async function listQueuedSessionRows(handle) {
  return (await listUnsyncedOps(handle))
    .filter(o => o.type === 'session_create')
    .map(o => o.payload?.row)
    .filter(Boolean);
}

/** { [sessionId]: completeFields } from un-synced session_complete ops (last wins). */
export async function listQueuedSessionCompletions(handle) {
  const map = {};
  for (const o of await listUnsyncedOps(handle)) {
    if (o.type === 'session_complete' && o.payload?.sessionId) map[o.payload.sessionId] = o.payload.fields;
  }
  return map;
}

/** component_inspections rows from un-synced inspection_save ops for one session. */
export async function listQueuedInspectionRows(handle, sessionId) {
  return (await listUnsyncedOps(handle))
    .filter(o => o.type === 'inspection_save' && o.payload?.row?.walk_session_id === sessionId)
    .map(o => o.payload.row);
}

/** Whether a session exists ONLY in the queue (its create op hasn't synced). */
export async function hasQueuedSessionCreate(handle, sessionId) {
  return (await listUnsyncedOps(handle)).some(o => o.type === 'session_create' && o.payload?.row?.id === sessionId);
}

/** Remove all ops (and photos) for a session — used when an empty offline session
 *  is deleted before it ever synced. */
export async function dropSession(handle, sessionId) {
  const ops = await listOps(handle);
  for (const o of ops) {
    if (o.sessionId === sessionId || o.payload?.row?.id === sessionId) {
      // clean up any photos this op referenced
      for (const pid of (o.payload?.photoIds ?? [])) await deletePhoto(handle, pid);
      await deleteOp(handle, o.seq);
    }
  }
}

// -- Photos --------------------------------------------------------------------

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

/** All stashed photos for one inspection. */
export async function listPhotosFor(handle, inspectionId) {
  const all = await handle.getAll(STORE_PHOTOS);
  return all.filter(p => p.inspectionId === inspectionId);
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
