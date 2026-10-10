// parking/utils/lookupSnapshot.js
//
// The copy of Parking data a phone keeps for the Registration Lookup with no
// signal (Parking (M), 2026-10-10), and the lookup run against it. Pure.
//
// ⛔ PERSONAL DATA ON A DEVICE. The user chose the full copy — holder name and
// phone included, as the online lookup shows (2026-10-10). So the copy holds
// ONLY what the lookup reads, nothing else about a holder: no address, email,
// notes, deposit or devices. It is tagged with the user it was read for, and
// a copy read for anyone else is refused (a phone handed on without logging
// out must not show the last person's copy). Logout deletes it
// (#lib/offline/wipe.js).
//
// The lookup is the online one, unchanged: findByRegistration for the car park,
// findPermitsByRegistration for the road — so the phone and the office cannot
// disagree about what a registration means.

import { findByRegistration } from './agreementModel.js';
import { findPermitsByRegistration } from './permitModel.js';

export const SNAPSHOT_VERSION = 1;

const pick = (/** @type {any} */ o, /** @type {string[]} */ keys) =>
  Object.fromEntries(keys.map((k) => [k, o?.[k] ?? null]));

/**
 * The phone copy, from what the Parking and permit stores hold.
 * @param {{ vehicles?: any[], agreements?: any[], holders?: any[], bays?: any[], permits?: any[] }} data
 * @param {string} userId  who it was read for
 * @param {number} [now]
 */
export function buildLookupSnapshot(data, userId, now = Date.now()) {
  return {
    version: SNAPSHOT_VERSION,
    userId,
    readAt: now,
    vehicles:   (data.vehicles ?? []).map((v) => pick(v, ['id', 'agreement_id', 'registration', 'from_date', 'to_date'])),
    agreements: (data.agreements ?? []).map((a) => pick(a, ['id', 'reference', 'status', 'holder_id', 'bay_id', 'starts_on', 'ends_on'])),
    holders:    (data.holders ?? []).map((h) => pick(h, ['id', 'display_name', 'phone'])),
    bays:       (data.bays ?? []).filter((b) => b.bay_id).map((b) => pick(b, ['bay_id', 'ref'])),
    permits:    (data.permits ?? []).map((p) => pick(p, [
      'id', 'permit_number', 'company', 'registration', 'valid_from', 'valid_from_time', 'valid_to', 'valid_to_time',
    ])),
  };
}

/**
 * The copy if it may be shown to this user, else null.
 * @param {any} snap
 * @param {string|null|undefined} userId
 */
export function usableSnapshot(snap, userId) {
  if (!snap || snap.version !== SNAPSHOT_VERSION || !userId || snap.userId !== userId) return null;
  return snap;
}

/**
 * Both lookups against one copy (or the live stores — same shape).
 * @param {string} q
 * @param {any} snap
 * @param {string} todayISO   London date
 * @param {string} nowTime    London time HH:MM
 */
export function lookupBoth(q, snap, todayISO, nowTime) {
  return {
    carPark: findByRegistration(q, snap, todayISO),
    permits: findPermitsByRegistration(q, snap.permits ?? [], todayISO, nowTime),
  };
}
