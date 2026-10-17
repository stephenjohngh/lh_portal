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
 * The one-line answer to a check, for a person standing next to the car, FOR
 * WHERE IT IS (2026-10-17, user: a car with only a car park licence read
 * "allowed" on the side road). In the car park only a car park licence
 * counts; on the side road only a road permit does.
 *   ok       — a licence covering today (car park) / a permit current now (road)
 *   pending  — known here, but not yet (a draft, or starting later)
 *   ended    — known here, but no longer
 *   none     — nothing for this place
 * `elsewhere` says when the car IS allowed at the OTHER place — shown under
 * the answer, and put in the note of a sighting. ⛔ On the side road, when the
 * road permits could not be read, the answer says they were NOT checked:
 * "not found" would read as a car with no permit.
 * @param {{ standing: string, bay?: { ref?: string }|null }[]} hits   car park results (agreementModel.findByRegistration)
 * @param {{ status: string, permit?: { permit_number?: number, company?: string } }[]} permitHits  road permits
 * @param {string} [permitError]
 * @param {'car_park'|'road'} [place]
 * @returns {{ tone: 'ok'|'pending'|'ended'|'none', title: string, permitsUnchecked: boolean, elsewhere: string }}
 */
export function lookupVerdict(hits = [], permitHits = [], permitError = '', place = 'car_park') {
  const road = place === 'road';
  const unchecked = road && !!permitError;
  const licence = hits.find(h => h.standing === 'authorised');
  const permit = permitHits.find(h => h.status === 'current');
  const elsewhere = road
    ? (licence ? `Has a car park licence today${licence.bay?.ref ? ` (bay ${licence.bay.ref})` : ''} — not a road permit.` : '')
    : (permit ? `Has a current road permit${permit.permit?.permit_number != null ? ` (permit ${permit.permit.permit_number}${permit.permit.company ? `, ${permit.permit.company}` : ''})` : ''} — for the side road, not the car park.` : '');
  const tail = unchecked ? ' (road permits NOT checked)' : '';
  if (road ? permit : licence) {
    return { tone: 'ok', title: road ? 'Allowed — road permit' : 'Allowed — car park licence', permitsUnchecked: false, elsewhere: '' };
  }
  const notYet = road ? permitHits.some(h => h.status === 'upcoming') : hits.some(h => h.standing === 'pending');
  if (notYet) return { tone: 'pending', title: `Known, but not allowed here yet${tail}`, permitsUnchecked: unchecked, elsewhere };
  if (road ? permitHits.length : hits.length) {
    return { tone: 'ended', title: `Known, but no longer allowed here${tail}`, permitsUnchecked: unchecked, elsewhere };
  }
  return { tone: 'none', title: unchecked ? 'Road permits NOT checked' : 'Not found', permitsUnchecked: unchecked, elsewhere };
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
