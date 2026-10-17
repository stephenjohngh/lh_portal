// parking/utils/sightingModel.js
// Unauthorised parking records (migration 245): the places, the checks made
// before saving (the database makes them too), and a car's earlier sightings.
// Pure.

import { normaliseReg } from './agreementModel.js';

/** Where a car was seen — the database's CHECK list, with the words shown. */
export const SIGHTING_PLACES = Object.freeze({
  car_park: 'Car park',
  road:     'Side road',
});

/**
 * The problem with recording this, or null.
 * @param {{ registration?: string, place?: string }} s
 */
export function validateSighting({ registration = '', place = '' }) {
  const reg = normaliseReg(registration);
  if (reg.length < 2) return 'Enter the registration.';
  if (!/^[A-Z0-9]{2,8}$/.test(reg)) return 'A registration is letters and numbers, up to 8.';
  if (!Object.hasOwn(SIGHTING_PLACES, place)) return 'Choose where the car was.';
  return null;
}

/**
 * This car's sightings, newest first — the WHOLE registration only, as Car
 * check answers (registrationLookup.splitExact).
 * @template {{ registration: string, seen_at: string }} T
 * @param {string} q @param {T[]} sightings
 * @returns {T[]}
 */
export function sightingsOf(q, sightings = []) {
  const want = normaliseReg(q);
  if (!want) return [];
  return sightings
    .filter((s) => normaliseReg(s.registration) === want)
    .sort((a, b) => (a.seen_at < b.seen_at ? 1 : a.seen_at > b.seen_at ? -1 : 0));
}
