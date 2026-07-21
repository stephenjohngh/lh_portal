// src/lib/apps/inspection/utils/offlineQueue.js
//
// The Inspection app's durable offline outbox, layered on the generic IndexedDB
// wrapper (`$lib/utils/idb.js`). It holds three kinds of thing:
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

import { openDB, isIdbAvailable } from '$lib/utils/idb.js';

export const DB_NAME    = 'lh_inspection_offline';
export const DB_VERSION = 1;

export const STORE_OPS    = 'ops';
export const STORE_PHOTOS = 'photos';
export const STORE_CACHE  = 'readcache';

/** Op statuses. */
export const OP_PENDING = 'pending';
export const OP_SYNCING = 'syncing';
export const OP_ERROR   = 'error';
export const OP_DONE    = 'done';

/** Create the object stores on first open / version bump. */
export function upgradeSchema(db) {
  if (!db.objectStoreNames.contains(STORE_OPS))    db.createObjectStore(STORE_OPS,    { keyPath: 'seq', autoIncrement: true });
  if (!db.objectStoreNames.contains(STORE_PHOTOS)) db.createObjectStore(STORE_PHOTOS, { keyPath: 'photoId' });
  if (!db.objectStoreNames.contains(STORE_CACHE))  db.createObjectStore(STORE_CACHE,  { keyPath: 'key' });
}

// -- Singleton handle (browser) ------------------------------------------------

let _handlePromise = null;

/**
 * Open the shared offline DB (memoised). Throws under SSR / no-IndexedDB — call
 * isOfflineAvailable() first at the boundary.
 * @returns {Promise<import('$lib/utils/idb.js').IdbHandle>}
 */
export function openQueue() {
  if (!_handlePromise) _handlePromise = openDB(DB_NAME, DB_VERSION, upgradeSchema);
  return _handlePromise;
}

/** Whether the offline queue can be used here (browser with IndexedDB). */
export function isOfflineAvailable() {
  return isIdbAvailable();
}

// Test seam: reset the memoised handle between test files if ever needed.
export function _resetHandle() { _handlePromise = null; }

// -- Ops -----------------------------------------------------------------------

/**
 * Append an op to the outbox. Returns the stored record (with its assigned seq).
 * @param {object} handle
 * @param {{ type: string, sessionId?: string|null, payload?: object }} op
 */
export async function enqueue(handle, op) {
  const record = {
    type:      op.type,
    sessionId: op.sessionId ?? null,
    payload:   op.payload ?? {},
    status:    OP_PENDING,
    attempts:  0,
    lastError: null,
    createdAt: Date.now(),
  };
  const seq = await handle.add(STORE_OPS, record);
  return { ...record, seq };
}

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
    // Free any photo blobs the superseded op referenced that the new payload
    // doesn't (a re-inspect before sync captured a fresh photo set).
    const keep = new Set(payload?.photoIds ?? []);
    for (const pid of (existing.payload?.photoIds ?? [])) if (!keep.has(pid)) await deletePhoto(handle, pid);
    const updated = { ...existing, payload, status: OP_PENDING, attempts: 0, lastError: null };
    await handle.put(STORE_OPS, updated);
    return updated;
  }
  return enqueue(handle, {
    type:      'inspection_save',
    sessionId: payload?.row?.walk_session_id ?? null,
    payload,
  });
}

/** All ops, oldest first (by seq). */
export async function listOps(handle) {
  const all = await handle.getAll(STORE_OPS);
  return all.sort((a, b) => a.seq - b.seq);
}

/** Ops that still need work (not done), oldest first. */
export async function listUnsyncedOps(handle) {
  return (await listOps(handle)).filter(o => o.status !== OP_DONE);
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

/**
 * Set an op's status. Bumps `attempts` when moving into 'syncing' (i.e. once per
 * try) and records lastError. Returns the updated op, or null if it's gone.
 */
export async function setOpStatus(handle, seq, status, lastError = null) {
  const op = await handle.get(STORE_OPS, seq);
  if (!op) return null;
  const updated = {
    ...op,
    status,
    lastError,
    attempts: status === OP_SYNCING ? (op.attempts ?? 0) + 1 : (op.attempts ?? 0),
  };
  await handle.put(STORE_OPS, updated);
  return updated;
}

/** Remove one op. */
export function deleteOp(handle, seq) {
  return handle.delete(STORE_OPS, seq);
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

/** Garbage-collect completed ops (call after a full drain). */
export async function pruneDone(handle) {
  const ops = await listOps(handle);
  for (const o of ops) if (o.status === OP_DONE) await deleteOp(handle, o.seq);
}

// -- Photos --------------------------------------------------------------------

/**
 * Stash a captured photo Blob.
 * @param {object} handle
 * @param {{ photoId: string, inspectionId: string, blob: Blob, filename: string,
 *          folderPath: string[], uploaded?: boolean, url?: string|null }} photo
 */
export async function putPhoto(handle, photo) {
  await handle.put(STORE_PHOTOS, { uploaded: false, url: null, ...photo });
  return photo;
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

/** Mark a photo uploaded (idempotency: a retry then skips the re-upload). */
export async function markPhotoUploaded(handle, photoId, url) {
  const p = await handle.get(STORE_PHOTOS, photoId);
  if (!p) return null;
  const updated = { ...p, uploaded: true, url };
  await handle.put(STORE_PHOTOS, updated);
  return updated;
}

// -- Read cache ----------------------------------------------------------------

/** Persist a named payload (the load() result). */
export async function writeCache(handle, key, data) {
  await handle.put(STORE_CACHE, { key, ts: Date.now(), data });
}

/** Read a named payload → { ts, data, ageMs } or null. */
export async function readCache(handle, key) {
  const row = await handle.get(STORE_CACHE, key);
  if (!row) return null;
  return { ts: row.ts, data: row.data, ageMs: Date.now() - row.ts };
}

// -- Pure summary --------------------------------------------------------------

/**
 * Count ops by status — drives the header "N unsynced" badge and the finish-sheet
 * messaging. Pure; safe to call on any ops array.
 * @param {Array<{status:string}>} ops
 */
export function summarizeOps(ops) {
  const s = { pending: 0, syncing: 0, error: 0, done: 0 };
  for (const o of ops) if (o.status in s) s[o.status]++;
  return { ...s, unsynced: s.pending + s.syncing + s.error, total: ops.length };
}

/**
 * Choose the next op to sync: the first PENDING op (FIFO), skipping errored ones
 * (they need a manual retry) and any in flight (syncing). Session dependency order
 * (session_create → its inspections → complete) holds for free because ops are
 * enqueued in that order and the runner stops on a transient failure. Pure.
 * @param {Array<{status:string}>} ops  oldest-first
 */
export function pickNextOp(ops) {
  for (const o of ops) if (o.status === OP_PENDING) return o;
  return null;
}
