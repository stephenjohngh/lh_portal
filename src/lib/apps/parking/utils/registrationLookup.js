// src/lib/apps/parking/utils/registrationLookup.js
//
// "Whose car is this, and should it be here?" — the parts of the answer that
// are the same wherever it is asked: the Parking app's Registration Lookup and
// the caretaker's Car check page (/parking/check, 2026-10-17). Pure.

import { normaliseReg, formatReg } from './agreementModel.js';

/**
 * Every registration the page knows, for the scanner to match a plate to,
 * each labelled with where it is known from.
 * @param {any[]} [vehicles] @param {any[]} [permits]
 * @returns {{ value: string, label: string }[]}
 */
export function scanCandidatesFrom(vehicles = [], permits = []) {
  /** @type {Map<string, { value: string, from: Set<string> }>} */
  const seen = new Map();
  const add = (/** @type {string} */ reg, /** @type {string} */ from) => {
    const key = normaliseReg(reg);
    if (!key) return;
    if (!seen.has(key)) seen.set(key, { value: reg, from: new Set() });
    /** @type {any} */ (seen.get(key)).from.add(from);
  };
  for (const v of vehicles) add(formatReg(v.registration), 'car park');
  for (const p of permits) add(p.registration, 'road permit');
  return [...seen.values()].map(({ value, from }) => ({ value, label: [...from].join(' · ') }));
}

/**
 * The one-line answer to a lookup, for a person standing next to the car.
 *   ok       — a licence covering today, or a road permit current now
 *   pending  — known, but not yet (a draft, or starting later)
 *   ended    — known, but no longer
 *   none     — not found anywhere looked
 * ⛔ When the road permits could not be read and nothing in the car park
 * covers it, the answer says the permits were NOT checked: "not found" would
 * read as a car with no permit.
 * @param {{ standing: string }[]} hits         car park results (agreementModel.findByRegistration)
 * @param {{ status: string }[]} permitHits     road permit results (permitModel.findPermitsByRegistration)
 * @param {string} [permitError]
 * @returns {{ tone: 'ok'|'pending'|'ended'|'none', title: string, permitsUnchecked: boolean }}
 */
export function lookupVerdict(hits = [], permitHits = [], permitError = '') {
  const unchecked = !!permitError;
  if (hits.some(h => h.standing === 'authorised')) {
    return { tone: 'ok', title: 'Allowed — car park licence', permitsUnchecked: unchecked };
  }
  if (permitHits.some(h => h.status === 'current')) {
    return { tone: 'ok', title: 'Allowed — road permit', permitsUnchecked: false };
  }
  const tail = unchecked ? ' (road permits NOT checked)' : '';
  if (hits.some(h => h.standing === 'pending') || permitHits.some(h => h.status === 'upcoming')) {
    return { tone: 'pending', title: `Known, but not allowed yet${tail}`, permitsUnchecked: unchecked };
  }
  if (hits.length || permitHits.length) {
    return { tone: 'ended', title: `Known, but no longer allowed${tail}`, permitsUnchecked: unchecked };
  }
  return { tone: 'none', title: unchecked ? 'Not in the car park — road permits NOT checked' : 'Not found', permitsUnchecked: unchecked };
}

/**
 * Car check answers for the WHOLE registration only (2026-10-17, user: typing
 * "XC" showed XCVB 675's road permit as "allowed"). The lookup itself matches
 * any part — right at a desk, where a few letters find a car — so the results
 * are split: those whose registration is exactly the one asked about, which
 * decide the answer, and the rest, shown only as other cars that contain it.
 * @param {string} q
 * @param {{ vehicle: { registration: string } }[]} hits
 * @param {{ permit: { registration: string } }[]} permitHits
 */
export function splitExact(q, hits = [], permitHits = []) {
  const want = normaliseReg(q);
  const same = (/** @type {string} */ reg) => normaliseReg(reg) === want;
  return {
    hits: hits.filter(h => same(h.vehicle.registration)),
    permitHits: permitHits.filter(h => same(h.permit.registration)),
    otherHits: hits.filter(h => !same(h.vehicle.registration)),
    otherPermitHits: permitHits.filter(h => !same(h.permit.registration)),
  };
}
