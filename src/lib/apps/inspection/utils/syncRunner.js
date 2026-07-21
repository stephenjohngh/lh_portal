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
  getPhoto, markPhotoUploaded, deletePhoto,
  summarizeOps, pickNextOp, OP_PENDING, OP_SYNCING, OP_ERROR, OP_DONE,
} from './offlineQueue.js';
import { syncOne } from './inspectionSync.js';
import { makeSyncDeps } from './inspectionSyncDeps.js';

const logger = getLogger('syncRunner');

const _state = writable({ pending: 0, syncing: 0, error: 0, online: true });
/** Read-only view for the UI. */
export const syncState = { subscribe: _state.subscribe };

let draining = false;   // a drain is in progress
let rerun    = false;   // a drain was requested while one was running
let started  = false;   // startSync() has wired listeners
let unsubOnline = null;
let injectedDeps = null; // test seam

async function refreshState(patch = {}) {
  let counts = { pending: 0, syncing: 0, error: 0 };
  if (isOfflineAvailable()) {
    try { counts = summarizeOps(await listUnsyncedOps(await openQueue())); }
    catch (e) { logger('⚠ refreshState:', e.message); }
  }
  _state.update(v => ({ ...v, pending: counts.pending, syncing: counts.syncing, error: counts.error, ...patch }));
}

// A drain interrupted by a reload/crash can leave an op stuck 'syncing'. Reset
// those to pending on startup so they retry — the upsert is idempotent.
async function resetStaleSyncing(handle) {
  for (const o of await listOps(handle)) {
    if (o.status === OP_SYNCING) await setOpStatus(handle, o.seq, OP_PENDING);
  }
}

/** Drain the queue once (no-op offline / when already draining). */
export async function drain() {
  if (!isOfflineAvailable()) return;
  if (!getStore(online)) { await refreshState(); return; }
  if (draining) { rerun = true; return; }
  draining = true;
  try {
    const handle = await openQueue();
    // Photo-store helpers are bound to this handle; a test may override them (and
    // the server deps) via the injected object.
    const deps = {
      getPhoto:          (pid) => getPhoto(handle, pid),
      markPhotoUploaded: (pid, url) => markPhotoUploaded(handle, pid, url),
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
        // The blobs are now safely on Drive + attached — free the local copies.
        for (const pid of (next.payload?.photoIds ?? [])) await deletePhoto(handle, pid);
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
  } catch (e) {
    logger('⚠ drain error:', e.message);
  } finally {
    draining = false;
    if (rerun) { rerun = false; void drain(); }
  }
}

/** Fire-and-forget drain — safe to call after every record. */
export function kickSync() {
  void drain().catch(() => {});
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
    openQueue().then(resetStaleSyncing).then(kickSync).catch(() => {});
  }
}

/** Stop listening (component teardown). */
export function stopSync() {
  if (unsubOnline) { unsubOnline(); unsubOnline = null; }
  started = false;
}

/** Test seam: reset module state between tests. */
export function _reset() {
  draining = false; rerun = false; started = false; injectedDeps = null;
  if (unsubOnline) { unsubOnline(); unsubOnline = null; }
  _state.set({ pending: 0, syncing: 0, error: 0, online: true });
}
