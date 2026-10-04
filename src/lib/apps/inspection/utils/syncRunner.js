// src/lib/apps/inspection/utils/syncRunner.js
//
// Orchestrates draining the offline outbox to the server: a FIFO loop that stops
// on a transient failure (so it retries on the next reconnect) and skips a
// permanent one (so a rejected op can't wedge the queue forever). It listens for
// the browser coming back online and re-drains, and publishes a `syncState` store
// the UI reads for the "N unsynced" / OFFLINE badges.
//
// The per-op work lives in inspectionSync.syncOne (pure, deps-injected); this
// file owns the loop, the connectivity wiring and the shared counts.

import { writable, get as getStore } from 'svelte/store';
import { online } from '$lib/stores/online.js';
import { getLogger } from '$lib/utils/logger';
import {
  openQueue, isOfflineAvailable, listOps, listUnsyncedOps, setOpStatus, pruneDone,
  getPhoto, markPhotoUploaded, retirePhoto, pruneRetiredPhotos,
  summarizeOps, pickNextOp, OP_PENDING, OP_SYNCING, OP_ERROR, OP_DONE,
} from './offlineQueue.js';
import { syncOne } from './inspectionSync.js';
import { makeSyncDeps } from './inspectionSyncDeps.js';

const logger = getLogger('syncRunner');

// `items` is a lightweight per-op list so the walk UI can show per-component sync
// state (each inspection_save carries its inspectionId = the row id).
const _state = writable({ pending: 0, syncing: 0, error: 0, online: true, items: [] });
/** Read-only view for the UI. */
export const syncState = { subscribe: _state.subscribe };

// ⛔ `idle` is the drain in progress, re-runs included. Every caller during a
// drain gets THIS promise, so `await drain()` / `flush()` really waits for the
// queue to settle. It used to set a flag and return at once while another
// drain was running — and one is almost always running, because every recorded
// inspection kicks one. So Finish, pressed straight after the last component,
// counted the session's inspections before the last one had synced, and if the
// session's own create had not synced either, its close updated no row and was
// lost. Found 2026-10-04 by running a whole walk through this file (§6ccc 7).
/** @type {Promise<void>|null} */
let idle     = null;
let rerun    = false;   // a drain was requested while one was running
let started  = false;   // startSync() has wired listeners
let unsubOnline = null;
let injectedDeps = null; // test seam

async function refreshState(patch = {}) {
  let counts = { pending: 0, syncing: 0, error: 0 };
  let items = [];
  if (isOfflineAvailable()) {
    try {
      const ops = await listUnsyncedOps(await openQueue());
      counts = summarizeOps(ops);
      items = ops.map(o => ({
        seq:          o.seq,
        type:         o.type,
        status:       o.status,
        sessionId:    o.sessionId ?? o.payload?.row?.walk_session_id ?? null,
        inspectionId: o.type === 'inspection_save' ? (o.payload?.row?.id ?? null) : null,
      }));
    } catch (/** @type {any} */ e) { logger('⚠ refreshState:', e.message); }
  }
  _state.update(v => ({ ...v, pending: counts.pending, syncing: counts.syncing, error: counts.error, items, ...patch }));
}

// A drain interrupted by a reload/crash can leave an op stuck 'syncing'. Reset
// those to pending on startup so they retry — the upsert is idempotent.
async function resetStaleSyncing(handle) {
  for (const o of await listOps(handle)) {
    if (o.status === OP_SYNCING) await setOpStatus(handle, o.seq, OP_PENDING);
  }
}

/**
 * Drain the queue, and resolve only when it has settled — including any drain
 * asked for while this one ran. A call during a drain joins it (no-op offline).
 * @returns {Promise<void>}
 */
export function drain() {
  if (!isOfflineAvailable()) return Promise.resolve();
  if (idle) { rerun = true; return idle; }
  idle = (async () => {
    do { rerun = false; await drainOnce(); } while (rerun);
  })().finally(() => { idle = null; });
  return idle;
}

async function drainOnce() {
  if (!getStore(online)) { await refreshState(); return; }
  try {
    const handle = await openQueue();
    // Photo-store helpers are bound to this handle; a test may override them (and
    // the server deps) via the injected object.
    const deps = {
      getPhoto:          (pid) => getPhoto(handle, pid),
      markPhotoUploaded: (pid, url, provider) => markPhotoUploaded(handle, pid, url, provider),
      ...(injectedDeps ?? makeSyncDeps()),
    };
    for (;;) {
      if (!getStore(online)) break;                 // went offline mid-drain
      const next = pickNextOp(await listUnsyncedOps(handle));
      if (!next) break;
      await setOpStatus(handle, next.seq, OP_SYNCING);
      await refreshState();
      const res = await syncOne(next, deps);
      if (res.ok) {
        await setOpStatus(handle, next.seq, OP_DONE);
        // The blobs are now safely on Drive + attached — free the images, and
        // keep what each became, so a later re-inspect can remove one by name.
        for (const pid of (next.payload?.photoIds ?? [])) await retirePhoto(handle, pid);
      } else if (res.permanent) {
        logger('✗ permanent sync error — op', next.seq, next.type, res.error);
        await setOpStatus(handle, next.seq, OP_ERROR, res.error);
      } else {
        // Transient (offline / server unreachable) — put it back and stop; a
        // later kick / reconnect retries from here.
        await setOpStatus(handle, next.seq, OP_PENDING, res.error);
        break;
      }
      await refreshState();
    }
    await pruneDone(handle);
    await refreshState();
  } catch (/** @type {any} */ e) {
    logger('⚠ drain error:', e.message);
  }
}

/** Fire-and-forget drain — safe to call after every record. */
export function kickSync() {
  void drain().catch(() => {});
}

/** Reset every errored op back to pending and re-drain (the "Retry" button). */
export async function retryErrors() {
  if (!isOfflineAvailable()) return;
  try {
    const handle = await openQueue();
    for (const o of await listOps(handle)) if (o.status === OP_ERROR) await setOpStatus(handle, o.seq, OP_PENDING);
    await refreshState();
  } catch (/** @type {any} */ e) { logger('⚠ retryErrors:', e.message); }
  kickSync();
}

/** Drain and wait; returns the remaining unsynced summary. */
export async function flush() {
  await drain();
  if (isOfflineAvailable()) return summarizeOps(await listUnsyncedOps(await openQueue()));
  return { pending: 0, syncing: 0, error: 0, done: 0, unsynced: 0, total: 0 };
}

/**
 * Start the runner: wire the online listener and do an initial drain. Idempotent
 * — a second call just kicks a drain.
 * @param {object|null} deps  test seam; production passes null (real deps).
 */
export function startSync(deps = null) {
  injectedDeps = deps;
  if (started) { kickSync(); return; }
  started = true;
  _state.update(v => ({ ...v, online: getStore(online) }));
  unsubOnline = online.subscribe((isOnline) => {
    _state.update(v => ({ ...v, online: isOnline }));
    if (isOnline) kickSync();   // reconnected — drain what's queued
  });
  if (isOfflineAvailable()) {
    openQueue().then(async (h) => { await resetStaleSyncing(h); await pruneRetiredPhotos(h); }).then(kickSync).catch(() => {});
  }
}

/** Stop listening (component teardown). */
export function stopSync() {
  if (unsubOnline) { unsubOnline(); unsubOnline = null; }
  started = false;
}

