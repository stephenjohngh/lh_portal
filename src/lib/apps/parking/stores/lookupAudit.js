// parking/stores/lookupAudit.js
//
// The Registration Lookup's audit line, sent through the shared offline outbox
// (#lib/offline/outbox.js + syncRunner.js), 2026-10-10.
//
// Why: the lookup is used in the basement, where the signal cannot be relied
// on. With the Parking page already open, a lookup there still answers from
// what the page loaded — but a plain audit call made with no signal is lost,
// and Parking's standing decision is that lookups stay in the audit log. So the
// line is queued on the phone and sent at once with a signal, or when it
// returns, carrying the time of the lookup itself.
//
// ⛔ The queue holds the registrations looked up, so its database is deleted at
// logout (#lib/offline/wipe.js lists it); queued lines are sent first.
// Nothing about a holder is ever queued — the line names the search and the
// number of results, as before.

import { isIdbAvailable } from '#lib/utils/idb.js';
import { makeOpener, enqueue, upgradeOutboxSchema } from '#lib/offline/outbox.js';
import { createSyncRunner } from '#lib/offline/syncRunner.js';
import { onBeforeOfflineWipe } from '#lib/offline/wipe.js';
import { postJson, SESSION_EXPIRED } from '#lib/utils/request.js';
import { errMessage } from '#lib/utils/errors.js';
import { getLogger } from '#lib/utils/logger.js';

const logger = getLogger('ParkingLookupAudit');

export const DB_NAME = 'lh_parking_offline';
export const openQueue = makeOpener(DB_NAME, 1, upgradeOutboxSchema);

/**
 * Send one queued line. A line the server refuses (a 4xx other than an expired
 * session, a timeout or a rate limit) is skipped; anything else waits.
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
  if (!isIdbAvailable()) { await postJson('/api/audit/log', payload).catch(() => {}); return; }
  await enqueue(await openQueue(), { type: 'lookup_audit', payload });
  runner.kickSync();
}
