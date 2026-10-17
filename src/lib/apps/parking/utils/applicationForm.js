// parking/utils/applicationForm.js
//
// The public parking application form's questions and checks (2026-10-17,
// migration 247), written once: the page checks as you type and the server
// checks again before anything is saved (it never trusts the page). Pure.
// What is asked is what a holder record holds (parking_holders), plus the bay
// size wanted; the database's CHECKs on parking_requests hold the same lines.

import { PARKING_BAY_TYPES } from '#lib/apps/building_assets/utils/spaceTypeOptions.js';
import { ANY_SIZE } from './waitingListModel.js';

/** Who is applying — the holder kinds, in words for the public. */
export const APPLICANT_KINDS = Object.freeze([
  { value: 'leaseholder',         label: 'I own a flat here' },
  { value: 'occupier',            label: 'I rent or live in a flat here' },
  { value: 'external_individual', label: 'I do not live here' },
  { value: 'external_company',    label: 'I am applying for a company' },
]);

/** The sizes that can be asked for: each bay size, or any. */
export function applicationSizes() {
  return [...PARKING_BAY_TYPES.map((v) => ({ value: v, label: v })), { value: ANY_SIZE, label: 'Any size' }];
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LIMITS = { display_name: 200, company_name: 200, email: 200, phone: 40, correspondence_address: 500, notes: 2000 };

/**
 * What is wrong with an application, field by field; an empty object when
 * nothing is.
 * @param {Record<string, any>} f
 * @returns {Record<string, string>}
 */
export function applicationProblems(f) {
  /** @type {Record<string, string>} */
  const e = {};
  const t = (/** @type {string} */ k) => String(f?.[k] ?? '').trim();
  if (!APPLICANT_KINDS.some((k) => k.value === f?.holder_type)) e.holder_type = 'Choose which of these describes you.';
  if (!t('display_name')) e.display_name = 'Enter your name.';
  if (f?.holder_type === 'external_company' && !t('company_name')) e.company_name = 'Enter the company’s name.';
  if (!EMAIL.test(t('email'))) e.email = 'Enter an email address we can reach you at.';
  if (!applicationSizes().some((s) => s.value === f?.wanted_size)) e.wanted_size = 'Choose the size of space you need.';
  if (f?.agreed !== true) e.agreed = 'Please read the privacy notice and tick to agree.';
  for (const [k, max] of Object.entries(LIMITS)) {
    if (t(k).length > max) e[k] = `Please keep this to ${max} characters.`;
  }
  return e;
}

/** The fields saved, trimmed. @param {Record<string, any>} f */
export function applicationRow(f) {
  const t = (/** @type {string} */ k) => String(f?.[k] ?? '').trim();
  return {
    holder_type: f.holder_type,
    display_name: t('display_name'),
    company_name: t('company_name') || null,
    email: t('email').toLowerCase(),
    phone: t('phone') || null,
    correspondence_address: t('correspondence_address') || null,
    wanted_size: f.wanted_size,
    notes: t('notes') || null,
  };
}
