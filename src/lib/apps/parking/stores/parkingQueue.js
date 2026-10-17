// parking/stores/parkingQueue.js
//
// Parking's offline queue: everything Parking writes from the car park, where
// the signal cannot be relied on, waits on the phone and is sent when there is
// one. Built from the shared offline pieces — the outbox and its sending loop
// (#lib/offline/outbox.js, syncRunner.js), the photo store (photoStore.js) and
// the retry rule (syncErrors.js). Two kinds of item:
//
//   'lookup_audit' — a Registration Lookup's audit line (2026-10-10). The
//                    lookup answers from what the page loaded; the line names
//                    the search and the number of results, never a holder.
//   'audit'        — any other Parking audit line made where there may be no
//                    signal (a sighting's), sent the same way;
//   'sighting'     — an unauthorised-parking record (2026-10-17, migration 245)
//                    with its photo held in the photo store until sent. The
//                    record's id is made on the phone, so a send repeated
//                    after a dropped connection cannot record it twice, and a
//                    photo already uploaded is not uploaded again.
//
// ⛔ The queue holds registrations and photos of cars, so its database is
// deleted at logout (#lib/offline/wipe.js lists it); what is waiting is sent
// first if there is a signal. ⚠ Logging out with no signal loses what has not
// been sent — the screens say what is waiting.

import { isIdbAvailable } from '#lib/utils/idb.js';
import { makeOpener, enqueue, upgradeOutboxSchema } from '#lib/offline/outbox.js';
import { upgradePhotoSchema, putPhoto, getPhoto, deletePhoto, markPhotoUploaded } from '#lib/offline/photoStore.js';
import { createSyncRunner } from '#lib/offline/syncRunner.js';
import { classifySyncError } from '#lib/offline/syncErrors.js';
import { onBeforeOfflineWipe } from '#lib/offline/wipe.js';
import { getLogger } from '#lib/utils/logger.js';

const logger = getLogger('ParkingQueue');

export const DB_NAME = 'lh_parking_offline';
// Version 2 (2026-10-17) adds the photo store for sightings; the ops queue is kept.
export const openQueue = makeOpener(DB_NAME, 2, (db) => { upgradeOutboxSchema(db); upgradePhotoSchema(db); });

export const SIGHTING_ENTITY = 'parking_sighting';

/**
 * Send one queued audit line.
 * @param {any} op @param {{ post: (body: any) => Promise<any> }} deps
 */
export async function syncAuditOp(op, deps) {
  try {
    await deps.post(op.payload);
    return { ok: true };
  } catch (/** @type {any} */ e) {
    return classifySyncError(e);
  }
}

/**
 * Send one queued sighting: the record, then its photo. Safe to repeat:
 *   · the record carries the id it was given on the phone — "already there"
 *     (a unique-key refusal, 23505) counts as done;
 *   · a sighting that already has a photo attached is not given another;
 *   · a photo uploaded before the connection dropped is remembered on the
 *     phone (markPhotoUploaded) and attached without uploading it again.
 * A photo no longer on the phone (never taken, or cleared) leaves the record.
 * @param {any} op
 * @param {{ insertSighting: (row: any) => Promise<any>,
 *           listAttachments: (type: string, id: string) => Promise<any[]>,
 *           addAttachments: (type: string, id: string, items: any[], userId: string) => Promise<void>,
 *           uploadMedia: (blob: Blob, o: { filename: string, folderPath: string[] }) => Promise<{ url: string, provider: string, sizeBytes: number }>,
 *           getPhoto: (id: string) => Promise<any>,
 *           markPhotoUploaded: (id: string, url: string, provider: string|null) => Promise<any> }} deps
 */
export async function syncSightingOp(op, deps) {
  const { row, photoId } = op.payload ?? {};
  try {
    try {
      await deps.insertSighting(row);
    } catch (/** @type {any} */ e) {
      if (e?.code !== '23505') throw e;           // already recorded by an earlier attempt
    }
    if (!photoId) return { ok: true };
    if ((await deps.listAttachments(SIGHTING_ENTITY, row.id)).length) return { ok: true };
    let photo = await deps.getPhoto(photoId);
    if (!photo) { logger('⚠ photo no longer on the phone for sighting', row.id); return { ok: true }; }
    if (!photo.uploaded || !photo.url) {
      const up = await deps.uploadMedia(photo.blob, { filename: photo.filename, folderPath: photo.folderPath });
      photo = await deps.markPhotoUploaded(photoId, up.url, up.provider ?? null) ?? { ...photo, url: up.url, provider: up.provider };
    }
    await deps.addAttachments(SIGHTING_ENTITY, row.id, [{ url: photo.url, provider: photo.provider ?? null }], row.created_by);
    return { ok: true };
  } catch (/** @type {any} */ e) {
    return classifySyncError(e);
  }
}

/** Send one op of any kind. */
export function syncParkingOp(/** @type {any} */ op, /** @type {any} */ deps) {
  if (op.type === 'lookup_audit' || op.type === 'audit') return syncAuditOp(op, deps);
  if (op.type === 'sighting') return syncSightingOp(op, deps);
  return Promise.resolve({ ok: false, permanent: true, error: `Unknown op type: ${op.type}` });
}

/** The real server calls, loaded when first needed (they bring the sign-in client). */
async function realDeps() {
  const [{ postJson }, { api }, media, { uploadMedia }] = await Promise.all([
    import('#lib/utils/request.js'), import('#lib/utils/api.js'),
    import('#lib/utils/mediaAttachments.js'), import('#lib/utils/mediaUpload.js'),
  ]);
  return {
    post: (/** @type {any} */ body) => postJson('/api/audit/log', body),
    insertSighting: (/** @type {any} */ row) => api.create('parking_sightings', row, false),
    listAttachments: media.listAttachments,
    addAttachments: media.addAttachments,
    uploadMedia,
  };
}

/** @type {Set<(op: any) => void>} */
const syncedListeners = new Set();
/**
 * Called after each op has been sent (the sightings list re-reads).
 * @param {(op: any) => void} fn @returns {() => void} unsubscribe
 */
export function onSynced(fn) { syncedListeners.add(fn); return () => syncedListeners.delete(fn); }

/** @type {any} */
let lazyDeps = null;
const runner = createSyncRunner({
  name: 'parking',
  openQueue: () => openQueue(),
  isOfflineAvailable: isIdbAvailable,
  syncOne: async (op, deps) => syncParkingOp(op, { ...(deps.injected ?? (lazyDeps ??= await realDeps())), ...deps.photos }),
  makeDeps: (handle, injected) => ({
    injected,
    photos: {
      getPhoto: (/** @type {string} */ id) => getPhoto(handle, id),
      markPhotoUploaded: (/** @type {string} */ id, /** @type {string} */ url, /** @type {string|null} */ provider) => markPhotoUploaded(handle, id, url, provider),
    },
  }),
  // A sighting sent: its photo is on the server now, so the phone's copy goes.
  afterDone: async (handle, op) => {
    if (op.type === 'sighting' && op.payload?.photoId) await deletePhoto(handle, op.payload.photoId);
    for (const fn of syncedListeners) { try { fn(op); } catch (/** @type {any} */ e) { logger('⚠ onSynced:', e?.message ?? e); } }
  },
  // What a waiting sighting is, for the screens that show it before it is sent.
  itemOf: (o) => (o.type === 'sighting' ? { sighting: o.payload?.row ?? null, hasPhoto: !!o.payload?.photoId } : {}),
});
export const { syncState, startSync, stopSync, kickSync, flush, retryErrors } = runner;

// Before logout deletes the queue: send what is waiting (the token is still
// good), then close the connection so the delete is not blocked.
onBeforeOfflineWipe(async () => {
  try { await runner.flush(); } finally { await openQueue.close(); }
});

/**
 * Queue a lookup's audit line and try to send it.
 * @param {{ query: string, results: number, permitResults: number }} found
 * @param {{ offline?: boolean }} [opts]
 */
export async function queueLookupAudit(found, { offline = false } = {}) {
  const payload = {
    eventType: 'view', targetType: 'parking_vehicle', targetId: null, targetName: 'registration lookup',
    appId: 'parking', eventCategory: 'parking', eventAction: 'registration_lookup',
    afterData: { ...found, lookedUpAt: new Date().toISOString(), ...(offline ? { offline: true } : {}) },
  };
  if (!isIdbAvailable()) {
    const { postJson } = await import('#lib/utils/request.js');
    await postJson('/api/audit/log', payload).catch(() => {});
    return;
  }
  await enqueue(await openQueue(), { type: 'lookup_audit', payload });
  runner.kickSync();
}

/**
 * Queue an audit line (the body /api/audit/log takes) and try to send it.
 * @param {Record<string, any>} payload
 */
export async function queueAudit(payload) {
  await enqueue(await openQueue(), { type: 'audit', payload });
  runner.kickSync();
}

/**
 * Queue a sighting (its row already made, id included) and its photo, and try
 * to send it.
 * @param {Record<string, any>} row  { id, registration, place, notes, seen_at, created_by }
 * @param {{ blob: Blob, filename: string, folderPath: string[] } | null} photo
 */
export async function queueSighting(row, photo) {
  const handle = await openQueue();
  let photoId = null;
  if (photo) {
    photoId = `sighting-${row.id}`;
    await putPhoto(handle, { photoId, sightingId: row.id, ...photo });
  }
  await enqueue(handle, { type: 'sighting', payload: { row, photoId } });
  runner.kickSync();
}
