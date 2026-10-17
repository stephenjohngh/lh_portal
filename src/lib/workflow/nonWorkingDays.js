// src/lib/workflow/nonWorkingDays.js
//
// The days a working-day deadline skips besides weekends (migration 248):
// the bank holidays. As SHIPPED — England and Wales, 2026 to 2028, from
// GOV.UK's published list. ⭐ Applied by the app (the seed rule): when the
// table is empty, an admin opening Admin → Workflows or setting up a workflow
// adds these; after that the list is the admin's (add the next years, a
// building closure, or remove one) and is never refilled behind their back.

import { api } from '#lib/utils/api.js';
import { requireUserId } from '#lib/utils/currentUser.js';

export const SHIPPED_NON_WORKING_DAYS = Object.freeze([
  ['2026-01-01', 'New Year’s Day'], ['2026-04-03', 'Good Friday'], ['2026-04-06', 'Easter Monday'],
  ['2026-05-04', 'Early May bank holiday'], ['2026-05-25', 'Spring bank holiday'], ['2026-08-31', 'Summer bank holiday'],
  ['2026-12-25', 'Christmas Day'], ['2026-12-28', 'Boxing Day (substitute day)'],
  ['2027-01-01', 'New Year’s Day'], ['2027-03-26', 'Good Friday'], ['2027-03-29', 'Easter Monday'],
  ['2027-05-03', 'Early May bank holiday'], ['2027-05-31', 'Spring bank holiday'], ['2027-08-30', 'Summer bank holiday'],
  ['2027-12-27', 'Christmas Day (substitute day)'], ['2027-12-28', 'Boxing Day (substitute day)'],
  ['2028-01-03', 'New Year’s Day (substitute day)'], ['2028-04-14', 'Good Friday'], ['2028-04-17', 'Easter Monday'],
  ['2028-05-01', 'Early May bank holiday'], ['2028-05-29', 'Spring bank holiday'], ['2028-08-28', 'Summer bank holiday'],
  ['2028-12-25', 'Christmas Day'], ['2028-12-26', 'Boxing Day'],
].map(([day, name]) => Object.freeze({ day, name })));

/** Every non-working day, in date order. */
export function listNonWorkingDays() {
  return api.getAll('non_working_days', { orderBy: 'day', ascending: true, tiebreak: false });
}

/** Admin: add the shipped list when the table is empty. Returns how many were added. */
export async function ensureNonWorkingDays() {
  if ((await api.count('non_working_days')) > 0) return 0;
  const userId = await requireUserId();
  await api.createMany('non_working_days', SHIPPED_NON_WORKING_DAYS.map((d) => ({ ...d, created_by: userId })));
  return SHIPPED_NON_WORKING_DAYS.length;
}

/** Admin. @param {string} day 'YYYY-MM-DD' @param {string} name */
export async function addNonWorkingDay(day, name) {
  return api.create('non_working_days', { day, name: name.trim(), created_by: await requireUserId() }, true);
}

/** Admin. @param {string} day */
export async function removeNonWorkingDay(day) {
  return api.deleteMany('non_working_days', { day });
}
