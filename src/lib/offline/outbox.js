// src/lib/offline/outbox.js
//
// A durable offline outbox and read cache, shared by the phone apps that must
// work without a signal (2026-10-10). Lifted unchanged from the Inspection
// app's offlineQueue.js, which keeps its own photo store and walk rules on top.
//
// Two object stores every offline database has:
//   • ops       — a FIFO of server operations still to sync (seq autoincrement).
//   • readcache — the last-good load, so the app can open with no signal.
// An app adds its own stores in its upgrade function (Inspection: photos).
//
// Every function takes an `IdbHandle` (or an in-memory handle of the same
// shape, in tests) as its first argument.
//
// Op record: { seq, type, sessionId, payload, status, attempts, lastError, createdAt }
//   status ∈ 'pending' | 'syncing' | 'error' | 'done'

import { openDB } from '#lib/utils/idb.js';

export const STORE_OPS   = 'ops';
export const STORE_CACHE = 'readcache';

export const OP_PENDING = 'pending';
export const OP_SYNCING = 'syncing';
export const OP_ERROR   = 'error';
export const OP_DONE    = 'done';

/** Create the two shared stores (call from an app's upgrade function). */
export function upgradeOutboxSchema(db) {
  if (!db.objectStoreNames.contains(STORE_OPS))   db.createObjectStore(STORE_OPS,   { keyPath: 'seq', autoIncrement: true });
  if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
}

/**
 * A memoised opener for one app's offline database.
 * @param {string} name
 * @param {number} version
 * @param {(db: IDBDatabase, oldVersion: number) => void} [upgrade]  defaults to the shared stores only
 * @returns {(() => Promise<import('#lib/utils/idb.js').IdbHandle>) & { close: () => Promise<void> }}
 */
export function makeOpener(name, version, upgrade = upgradeOutboxSchema) {
  /** @type {Promise<import('#lib/utils/idb.js').IdbHandle>|null} */
  let handle = null;
  const open = () => {
    if (!handle) handle = openDB(name, version, upgrade).catch((err) => { handle = null; throw err; });
    return handle;
  };
  /** Close the connection (before the database is deleted); the next open reopens it. */
  open.close = async () => {
    const h = handle;
    handle = null;
    if (h) { try { (await h).close(); } catch { /* never opened */ } }
  };
  return open;
}

// -- Ops -----------------------------------------------------------------------

/**
 * Append an op. Returns the stored record, with its seq.
 * @param {any} handle
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

/** All ops, oldest first. */
export async function listOps(handle) {
  const all = await handle.getAll(STORE_OPS);
  return all.sort((a, b) => a.seq - b.seq);
}

/** Ops that still need work (not done), oldest first. */
export async function listUnsyncedOps(handle) {
  return (await listOps(handle)).filter(o => o.status !== OP_DONE);
}

/**
 * Set an op's status. Bumps `attempts` when moving into 'syncing' (once per
 * try) and records lastError. Returns the updated op, or null if it is gone.
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

/** Garbage-collect completed ops (after a full drain). */
export async function pruneDone(handle) {
  for (const o of await listOps(handle)) if (o.status === OP_DONE) await deleteOp(handle, o.seq);
}

// -- Read cache ----------------------------------------------------------------

/** Persist a named payload. */
export async function writeCache(handle, key, data) {
  await handle.put(STORE_CACHE, { key, ts: Date.now(), data });
}

/** Read a named payload → { ts, data, ageMs } or null. */
export async function readCache(handle, key) {
  const row = await handle.get(STORE_CACHE, key);
  if (!row) return null;
  return { ts: row.ts, data: row.data, ageMs: Date.now() - row.ts };
}

// -- Pure ----------------------------------------------------------------------

/**
 * Count ops by status — the "N unsynced" badge.
 * @param {Array<{status:string}>} ops
 */
export function summarizeOps(ops) {
  const s = { pending: 0, syncing: 0, error: 0, done: 0 };
  for (const o of ops) if (o.status in s) s[o.status]++;
  return { ...s, unsynced: s.pending + s.syncing + s.error, total: ops.length };
}

/**
 * The next op to sync: the first PENDING one (FIFO). Errored ops wait for a
 * manual retry; one in flight is skipped. Dependency order holds because ops
 * are enqueued in order and the runner stops on a transient failure.
 * @param {Array<{status:string}>} ops  oldest first
 */
export function pickNextOp(ops) {
  for (const o of ops) if (o.status === OP_PENDING) return o;
  return null;
}
