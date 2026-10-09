// src/lib/offline/syncRunner.js
//
// The loop that drains an offline outbox (outbox.js) to the server, shared by
// the phone apps that work without a signal (2026-10-10). Lifted unchanged
// from the Inspection app, which now builds its runner from this.
//
// A FIFO drain that stops on a transient failure (it retries on the next
// reconnect) and skips a permanent one (a refused op cannot wedge the queue).
// It listens for the browser coming back online, and publishes a `syncState`
// store the UI reads for its "N unsynced" / OFFLINE badges.
//
// ⛔ `idle` is the drain in progress, re-runs included. Every caller during a
// drain gets THAT promise, so `await drain()` / `flush()` really waits for the
// queue to settle. It once returned at once while another drain ran, and one
// nearly always is — so Inspection's Finish counted a session before its last
// inspection had synced (found 2026-10-04 by running a whole walk, §6ccc 7).

import { writable, get as getStore } from 'svelte/store';
import { online } from '#lib/stores/online.js';
import { getLogger } from '#lib/utils/logger.js';
import {
  listOps, listUnsyncedOps, setOpStatus, pruneDone, summarizeOps, pickNextOp,
  OP_PENDING, OP_SYNCING, OP_ERROR, OP_DONE,
} from './outbox.js';

/**
 * @typedef {{ ok: boolean, permanent?: boolean, error?: string }} SyncResult
 * @typedef {object} RunnerConfig
 * @property {string} name                                   for the log
 * @property {() => Promise<any>} openQueue                  the app's offline database
 * @property {() => boolean} isOfflineAvailable              false under SSR / no IndexedDB
 * @property {(op: any, deps: any) => Promise<SyncResult>} syncOne   sends one op
 * @property {(handle: any, injected: any) => any} makeDeps  the deps syncOne needs; `injected` is a test's, or null
 * @property {(handle: any, op: any) => Promise<void>} [afterDone]  after an op has synced
 * @property {(handle: any) => Promise<void>} [onStart]      once, at start-up (after stale ops are reset)
 * @property {(op: any) => Record<string, any>} [itemOf]     extra fields per op in syncState.items
 */

/** @param {RunnerConfig} config */
export function createSyncRunner(config) {
  const { openQueue, isOfflineAvailable, syncOne, makeDeps, afterDone, onStart, itemOf } = config;
  const logger = getLogger(`sync:${config.name}`);

  const _state = writable({ pending: 0, syncing: 0, error: 0, online: true, items: /** @type {any[]} */ ([]) });

  /** @type {Promise<void>|null} */
  let idle = null;
  let rerun = false;
  let started = false;
  /** @type {(() => void)|null} */
  let unsubOnline = null;
  let injected = null;

  async function refreshState(patch = {}) {
    let counts = { pending: 0, syncing: 0, error: 0 };
    let items = [];
    if (isOfflineAvailable()) {
      try {
        const ops = await listUnsyncedOps(await openQueue());
        counts = summarizeOps(ops);
        items = ops.map(o => ({ seq: o.seq, type: o.type, status: o.status, ...(itemOf?.(o) ?? {}) }));
      } catch (/** @type {any} */ e) { logger('⚠ refreshState:', e.message); }
    }
    _state.update(v => ({ ...v, pending: counts.pending, syncing: counts.syncing, error: counts.error, items, ...patch }));
  }

  // A drain cut short by a reload can leave an op stuck 'syncing'; put those
  // back to pending at start-up so they retry. Every op must be safe to repeat.
  async function resetStaleSyncing(handle) {
    for (const o of await listOps(handle)) {
      if (o.status === OP_SYNCING) await setOpStatus(handle, o.seq, OP_PENDING);
    }
  }

  async function drainOnce() {
    if (!getStore(online)) { await refreshState(); return; }
    try {
      const handle = await openQueue();
      const deps = makeDeps(handle, injected);
      for (;;) {
        if (!getStore(online)) break;
        const next = pickNextOp(await listUnsyncedOps(handle));
        if (!next) break;
        await setOpStatus(handle, next.seq, OP_SYNCING);
        await refreshState();
        const res = await syncOne(next, deps);
        if (res.ok) {
          await setOpStatus(handle, next.seq, OP_DONE);
          if (afterDone) await afterDone(handle, next);
        } else if (res.permanent) {
          logger('✗ permanent sync error — op', next.seq, next.type, res.error);
          await setOpStatus(handle, next.seq, OP_ERROR, res.error);
        } else {
          // Transient: put it back and stop; a reconnect retries from here.
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

  /** Drain, resolving only when the queue has settled. A call during a drain joins it. */
  function drain() {
    if (!isOfflineAvailable()) return Promise.resolve();
    if (idle) { rerun = true; return idle; }
    idle = (async () => {
      do { rerun = false; await drainOnce(); } while (rerun);
    })().finally(() => { idle = null; });
    return idle;
  }

  /** Fire-and-forget drain — safe to call after every write. */
  function kickSync() {
    void drain().catch(() => {});
  }

  /** Put every errored op back to pending and drain (the Retry button). */
  async function retryErrors() {
    if (!isOfflineAvailable()) return;
    try {
      const handle = await openQueue();
      for (const o of await listOps(handle)) if (o.status === OP_ERROR) await setOpStatus(handle, o.seq, OP_PENDING);
      await refreshState();
    } catch (/** @type {any} */ e) { logger('⚠ retryErrors:', e.message); }
    kickSync();
  }

  /** Drain and wait; returns what is still unsynced. */
  async function flush() {
    await drain();
    if (isOfflineAvailable()) return summarizeOps(await listUnsyncedOps(await openQueue()));
    return { pending: 0, syncing: 0, error: 0, done: 0, unsynced: 0, total: 0 };
  }

  /**
   * Wire the online listener and drain. Idempotent: a second call just drains.
   * @param {any} [deps]  test seam; production passes nothing
   */
  function startSync(deps = null) {
    injected = deps;
    if (started) { kickSync(); return; }
    started = true;
    _state.update(v => ({ ...v, online: getStore(online) }));
    unsubOnline = online.subscribe((isOnline) => {
      _state.update(v => ({ ...v, online: isOnline }));
      if (isOnline) kickSync();
    });
    if (isOfflineAvailable()) {
      openQueue()
        .then(async (h) => { await resetStaleSyncing(h); if (onStart) await onStart(h); })
        .then(kickSync)
        .catch(() => {});
    }
  }

  /** Stop listening (component teardown). */
  function stopSync() {
    if (unsubOnline) { unsubOnline(); unsubOnline = null; }
    started = false;
  }

  return {
    syncState: { subscribe: _state.subscribe },
    drain, kickSync, retryErrors, flush, startSync, stopSync, refreshState,
  };
}

export { OP_PENDING, OP_SYNCING, OP_ERROR, OP_DONE };
