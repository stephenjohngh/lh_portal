// src/lib/apps/parking/utils/waitingListModel.js
// Parking, phase 3 — the waiting list and offers, as pure functions.
// docs/requirements/app_designs/Parking_App_Design.md §5.6.
//
// ⭐ FIRST COME, FIRST SERVED (user, 2026-09-26, decision D5). The queue for a
// bay size is every WAITING application wanting that size or any size, oldest
// first. Declining an offer, or letting it lapse, returns the application to
// the queue keeping its place (migration 224's trigger enforces that the
// joined date cannot move). If the policy changes, it changes HERE — `queue`
// is the only place the order is decided.

import { LIVE, addDaysISO } from './agreementModel.js';
import { policy } from '#lib/utils/policies.js';

export const ANY_SIZE = 'any';

export const APPLICATION_STATUSES = [
  { value: 'waiting',   label: 'Waiting' },
  { value: 'offered',   label: 'Offered a bay' },
  { value: 'allocated', label: 'Allocated' },
  { value: 'withdrawn', label: 'Withdrawn' },
];
export const APPLICATION_STATUS_LABEL = Object.fromEntries(APPLICATION_STATUSES.map(s => [s.value, s.label]));
export const OPEN = new Set(['waiting', 'offered']);

/** How long an offer stays open unless the person making it says otherwise. */
// How long an offer holds a bay by default is an admin policy (Admin →
// Policies; 14 days shipped), read when an offer is made.

/** Does an application want a bay of this size? */
export function wants(app, size) {
  return app.wanted_size === ANY_SIZE || app.wanted_size === size;
}

/**
 * The queue for a bay size: waiting applications that want that size (or any),
 * oldest first. Ties on the date go to whoever was entered first.
 * @param {object[]} applications
 * @param {string|null} size  a bay size; null gives every waiting application
 */
export function queue(applications, size = null) {
  return (applications ?? [])
    .filter(a => a.status === 'waiting' && (size == null || wants(a, size)))
    .sort((a, b) => a.joined_on.localeCompare(b.joined_on)
      || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
}

/** An application's place in the queue for the size it wants (1-based), or null. */
export function positionOf(app, applications) {
  if (app.status !== 'waiting') return null;
  const q = queue(applications).filter(a => a.wanted_size === app.wanted_size || a.wanted_size === ANY_SIZE
    || app.wanted_size === ANY_SIZE);
  const i = q.findIndex(a => a.id === app.id);
  return i < 0 ? null : i + 1;
}

/** The open offer on a bay, if any. */
export function openOfferOn(bayId, applications) {
  return bayId ? (applications ?? []).find(a => a.status === 'offered' && a.offered_bay_id === bayId) ?? null : null;
}

/** Whether an offer has passed its expiry date. */
export function offerLapsed(app, today) {
  return app.status === 'offered' && !!app.offer_expires_on && app.offer_expires_on < today;
}

/** The problem with a new application, or null. Mirrors migration 224. */
export function validateApplication(app, applications = []) {
  if (!app.holder_id) return 'Choose or add the applicant.';
  if (!String(app.wanted_size ?? '').trim()) return 'Choose the bay size wanted.';
  if (!app.joined_on) return 'Enter the date they joined the list.';
  const dup = applications.find(a => a.id !== app.id && a.holder_id === app.holder_id
    && a.wanted_size === app.wanted_size && OPEN.has(a.status));
  if (dup) return 'They already have an open application for that size.';
  return null;
}

/**
 * Is this bay free to offer from a date? Licensable, in use, no open offer,
 * and no live agreement holding it on or after the date.
 * @returns {string|null} why not, or null
 */
export function bayOfferProblem(bay, agreements, applications, fromDate) {
  if (!bay) return 'Choose a bay.';
  if (bay.tenure !== 'licensable') return `${bay.ref} is not licensable.`;
  if (bay.in_service === false) return `${bay.ref} is out of use.`;
  if (openOfferOn(bay.bay_id, applications)) return `${bay.ref} has already been offered to someone.`;
  const held = (agreements ?? []).find(a => bay.bay_id && a.bay_id === bay.bay_id && LIVE.has(a.status)
    && (!a.ends_on || a.ends_on >= fromDate));
  if (held) return `${bay.ref} is held by ${held.reference}.`;
  return null;
}

/** The problem with making an offer, or null. */
export function validateOffer(app, bay, agreements, applications, { made_on, expires_on }) {
  if (app?.status !== 'waiting') return 'Only a waiting application can be offered a bay.';
  if (!made_on || !expires_on) return 'Enter the date of the offer and when it expires.';
  if (expires_on < made_on) return 'The offer cannot expire before it is made.';
  if (bay && app.wanted_size !== ANY_SIZE && bay.size !== app.wanted_size) {
    return `${bay.ref} is ${bay.size ?? 'not sized'}; they want ${app.wanted_size}.`;
  }
  return bayOfferProblem(bay, agreements, applications, made_on);
}

/** The default expiry for an offer made on a date. */
export function defaultExpiry(madeOn, days = policy('parkingOfferDays')) {
  return addDaysISO(madeOn, days);
}

/**
 * First come, first served, for one bay: who should be offered it next. The
 * earliest waiting application wanting this bay's size or any size.
 */
export function nextFor(bay, applications) {
  if (!bay?.size) return null;
  return queue(applications, bay.size)[0] ?? null;
}

/**
 * The agreement already made for an open offer: a live agreement on the
 * offered bay for the person it was offered to. It exists when accepting
 * saved the agreement but marking the application accepted failed — and then
 * accepting AGAIN would only be refused as an overlap, so the screen offers to
 * finish the job instead.
 */
export function agreementForOffer(app, agreements = []) {
  if (app?.status !== 'offered' || !app.offered_bay_id) return null;
  return agreements.find(a => a.bay_id === app.offered_bay_id && a.holder_id === app.holder_id
    && LIVE.has(a.status)) ?? null;
}

/**
 * ⛔ If a bay is under offer, only the person offered it may be allocated it.
 * Allocating it to someone else from the bay panel would jump the queue.
 */
export function offerBlocks(bay, holderId, applications) {
  const offer = openOfferOn(bay?.bay_id, applications);
  if (offer && offer.holder_id !== holderId) {
    return `${bay.ref} is under offer to someone on the waiting list until ${offer.offer_expires_on}.`;
  }
  return null;
}
