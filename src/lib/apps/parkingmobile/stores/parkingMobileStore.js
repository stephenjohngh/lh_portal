// src/lib/apps/parkingmobile/stores/parkingMobileStore.js
//
// Parking (M): the Registration Lookup on a phone, for the basement where the
// signal cannot be relied on (2026-10-10).
//
//   • A COPY of what the lookup reads (lookupSnapshot.js) is kept on the phone,
//     refreshed whenever there is a signal, and used when there is none. The
//     screen always says how old it is: a copy is not the register.
//   • Every lookup is AUDITED, as the office lookup is (Parking's standing
//     decision: lookups stay in the audit log). The line is queued in the
//     shared outbox (#lib/offline/outbox.js) and sent by the shared sync loop —
//     at once with a signal, on reconnect without one — carrying the time of the
//     lookup itself, not the time it was sent.
//   • ⛔ The copy holds holders' names and phones (the user's choice), so it is
//     deleted at logout (#lib/offline/wipe.js lists this database) and refused
//     to anyone but the person it was read for.

import { writable, get } from 'svelte/store';
import { isIdbAvailable } from '#lib/utils/idb.js';
import { makeOpener, enqueue, readCache, writeCache, upgradeOutboxSchema } from '#lib/offline/outbox.js';
import { createSyncRunner } from '#lib/offline/syncRunner.js';
import { onBeforeOfflineWipe } from '#lib/offline/wipe.js';
import { postJson, SESSION_EXPIRED } from '#lib/utils/request.js';
import { errMessage } from '#lib/utils/errors.js';
import { getLogger } from '#lib/utils/logger.js';
import { today, fmtTime } from '#lib/utils/dates.js';
import { normaliseReg } from '#lib/apps/parking/utils/agreementModel.js';
import { buildLookupSnapshot, usableSnapshot, lookupBoth } from '#lib/apps/parking/utils/lookupSnapshot.js';
import { parkingStore } from '#lib/apps/parking/stores/parkingStore.js';
import { permitStore } from '#lib/apps/parking/stores/permitStore.js';

const logger = getLogger('ParkingMobile');

export const DB_NAME = 'lh_parking_offline';
const CACHE_KEY = 'lookup';
export const openQueue = makeOpener(DB_NAME, 1, upgradeOutboxSchema);

/**
 * Send one queued lookup audit line. A refused line (a 4xx other than an
 * expired session, a timeout or rate limit) is permanent and skipped; anything
 * else waits for the next reconnect.
 * @param {any} op
 * @param {{ post: (body: any) => Promise<any> }} deps
 */
export async function syncAuditOp(op, deps) {
  if (op.type !== 'lookup_audit') return { ok: false, permanent: true, error: `Unknown op type: ${op.type}` };
  try {
    await deps.post(op.payload);
    return { ok: true };
  } catch (/** @type {any} */ e) {
    const status = e?.status;
    const permanent = e?.message !== SESSION_EXPIRED && typeof status === 'number'
      && status >= 400 && status < 500 && status !== 408 && status !== 429;
    return { ok: false, permanent, error: errMessage(e) };
  }
}

const runner = createSyncRunner({
  name: 'parking',
  openQueue: () => openQueue(),
  isOfflineAvailable: isIdbAvailable,
  syncOne: syncAuditOp,
  makeDeps: (_handle, injected) => injected ?? { post: (body) => postJson('/api/audit/log', body) },
});
export const { syncState, startSync, stopSync, kickSync, flush, retryErrors } = runner;

// Before logout deletes the copy: send what is queued (the token is still
// good), then close the connection so the delete is not blocked.
onBeforeOfflineWipe(async () => {
  try { await runner.flush(); } finally { await openQueue.close(); }
});

/**
 * @typedef {{ snapshot: any|null, loading: boolean, refreshing: boolean,
 *             error: string|null, refreshError: string|null }} State
 */
const state = writable(/** @type {State} */ ({
  snapshot: null, loading: true, refreshing: false, error: null, refreshError: null,
}));

async function readCopy(userId) {
  if (!isIdbAvailable()) return null;
  try { return usableSnapshot((await readCache(await openQueue(), CACHE_KEY))?.data, userId); }
  catch (/** @type {any} */ err) { logger('⚠ could not read the phone copy:', err); return null; }
}

/** Read the live data and keep a fresh copy. Throws on failure. */
async function refresh(userId) {
  state.update((s) => ({ ...s, refreshing: true, refreshError: null }));
  try {
    await Promise.all([parkingStore.load(), permitStore.load()]);
    const p = get(parkingStore), pm = get(permitStore);
    const snap = buildLookupSnapshot({ ...p, permits: pm.permits }, userId);
    if (isIdbAvailable()) await writeCache(await openQueue(), CACHE_KEY, snap);
    state.update((s) => ({ ...s, snapshot: snap, refreshing: false, error: null }));
  } catch (/** @type {any} */ err) {
    state.update((s) => ({ ...s, refreshing: false, refreshError: errMessage(err, 'Could not read the car park.') }));
    throw err;
  }
}

/**
 * Open: show the phone copy at once, then refresh it when there is a signal.
 * @param {string} userId
 * @param {boolean} isOnline
 */
async function open(userId, isOnline) {
  state.update((s) => ({ ...s, loading: true, error: null }));
  const copy = await readCopy(userId);
  state.update((s) => ({ ...s, snapshot: copy }));
  try {
    if (isOnline) await refresh(userId);
  } catch (/** @type {any} */ err) {
    logger('⚠ refresh failed:', err);
  } finally {
    state.update((s) => ({
      ...s, loading: false,
      error: s.snapshot ? null
        : isOnline ? (s.refreshError ?? 'Could not read the car park.')
        : 'There is no copy on this phone yet. Open Parking (M) once with a signal, then it works without one.',
    }));
  }
}

/** Delete the copy (an account that may no longer use Parking). */
async function forget() {
  state.update((s) => ({ ...s, snapshot: null }));
  if (!isIdbAvailable()) return;
  try { await writeCache(await openQueue(), CACHE_KEY, null); }
  catch (/** @type {any} */ err) { logger('⚠ could not clear the phone copy:', err); }
}

/**
 * Look a registration up in the copy, and queue the audit line.
 * @param {string} q
 * @returns {ReturnType<typeof lookupBoth> | null}
 */
function lookup(q) {
  const snap = get(state).snapshot;
  if (!snap || normaliseReg(q).length < 2) return null;
  const now = new Date();
  const result = lookupBoth(q, snap, today(now), fmtTime(now.toISOString()));
  void queueAudit({
    query: normaliseReg(q),
    results: result.carPark.length,
    permitResults: result.permits.length,
    lookedUpAt: now.toISOString(),
    copyReadAt: new Date(snap.readAt).toISOString(),
    device: 'phone',
  });
  return result;
}

async function queueAudit(afterData) {
  if (!isIdbAvailable()) return;
  try {
    await enqueue(await openQueue(), {
      type: 'lookup_audit',
      payload: {
        eventType: 'view', targetType: 'parking_vehicle', targetId: null, targetName: 'registration lookup',
        appId: 'parking', eventCategory: 'parking', eventAction: 'registration_lookup', afterData,
      },
    });
    runner.kickSync();
  } catch (/** @type {any} */ err) {
    logger('⚠ could not queue the lookup audit line:', err);
  }
}

export const parkingMobileStore = { subscribe: state.subscribe, open, refresh, forget, lookup };
