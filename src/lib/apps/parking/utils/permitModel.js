// parking/utils/permitModel.js
// Parking permits for the side road (migration 236): the rules a permit must
// meet, said before anything is sent. Pure; the database holds the same
// CHECKs (company, registration and issuer not blank, valid_to >= valid_from)
// and gives the NUMBER itself — the browser never chooses one.

import { addDaysISO, daysBetween } from '#lib/utils/dates.js';
import { normaliseReg } from './agreementModel.js';

/** The two lengths a permit is usually issued for. `extraDays` is added to the start date. */
export const PERMIT_DURATIONS = Object.freeze([
  { key: 'day',  label: 'One day',  extraDays: 0 },
  { key: 'week', label: 'One week', extraDays: 6 },
]);

/** The last day of a permit of this length starting on `from` (inclusive). */
export function validToFor(from, durationKey) {
  const d = PERMIT_DURATIONS.find((x) => x.key === durationKey);
  if (!from || !d) return null;
  return addDaysISO(from, d.extraDays);
}

/**
 * A registration as printed: upper case, single spaces, nothing else. Unlike
 * normaliseReg (which strips every space so two spellings compare equal) this
 * keeps the space a person typed — "AB12 CDE" reads better than "AB12CDE".
 */
export function displayReg(s) {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The problem with a permit, or null.
 * @param {{ company?: string|null, registration?: string|null, valid_from?: string|null, valid_to?: string|null, issued_by?: string|null }} p
 */
export function validatePermit(p) {
  if (!String(p.company ?? '').trim())        return 'Enter the company name.';
  if (!normaliseReg(p.registration))          return 'Enter the vehicle registration.';
  if (!p.valid_from)                          return 'Enter the date the permit is valid from.';
  if (!p.valid_to)                            return 'Enter the date the permit is valid to.';
  if (p.valid_to < p.valid_from)              return 'The permit cannot end before it starts.';
  if (!String(p.issued_by ?? '').trim())      return 'Enter who issued the permit.';
  return null;
}

/** The row to insert. No permit_number: the database gives it. */
export function permitRow(p) {
  return {
    company:      String(p.company).trim(),
    registration: displayReg(p.registration),
    valid_from:   p.valid_from,
    valid_to:     p.valid_to,
    issued_by:    String(p.issued_by).trim(),
  };
}

/** "100", "007" — at least three digits, as the paper permits were. */
export function permitNumberLabel(n) {
  return String(n ?? '').padStart(3, '0');
}

/** 'upcoming' | 'current' | 'expired' on the given day (a London calendar date). */
export function permitStatus(permit, todayISO) {
  if (permit.valid_from > todayISO) return 'upcoming';
  if (permit.valid_to < todayISO)   return 'expired';
  return 'current';
}

/** How many days the permit covers, counting both ends. */
export function permitDays(permit) {
  return daysBetween(permit.valid_from, permit.valid_to) + 1;
}

/** The file a permit downloads as. */
export function permitFilename(permit) {
  if (permit.sample) return 'Parking_Permit_SAMPLE.pdf';
  const reg = normaliseReg(permit.registration) || 'permit';
  return `Parking_Permit_${permitNumberLabel(permit.permit_number)}_${reg}.pdf`;
}

/**
 * A new permit like an earlier one: the same company and vehicle, fresh dates
 * (one day from today — the person then picks the length). The issuer is not
 * copied: it is whoever is issuing now.
 */
export function reissueFields(permit, todayISO) {
  return {
    company: permit.company ?? '',
    registration: permit.registration ?? '',
    valid_from: todayISO,
    valid_to: todayISO,
  };
}

/**
 * The distinct values of one field across permits, newest permit first — the
 * suggestions offered while typing a company or a registration. Compared
 * ignoring case and spacing, so "AB12 CDE" and "ab12cde" are offered once.
 * @param {Array<Record<string, any>>} permits  newest first
 * @param {'company'|'registration'} field
 */
export function recentValues(permits, field) {
  const seen = new Set();
  const out = [];
  for (const p of permits) {
    const v = String(p[field] ?? '').trim();
    const key = v.toUpperCase().replace(/\s+/g, '');
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
