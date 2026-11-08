// src/lib/apps/building_assets/utils/statusRule.js
//
// The status a component has after an inspection result. Imports nothing, so the
// survey check (inspection/utils/surveyLoad.js) can use it; the walk reaches it
// through public.js (inspectionResultPatch). Mirrored in survey_load() (migration 290).
//
// ⭐ No access (user, 2026-11-08) is PROBLEM: not a Fail, and not OK, because the
// check did not take place. A Failed component stays Failed (a visit that saw nothing
// never softens a known failure) and an Inactive one stays Inactive.

/** Statuses a no-access visit does not change. */
export const KEPT_ON_NO_ACCESS = Object.freeze(['failed', 'inactive']);

/**
 * @param {string} result  ok | problem | failed | inactive | no_access
 * @param {string|null|undefined} currentStatus
 * @returns {string}
 */
export function statusAfterResult(result, currentStatus) {
  if (result !== 'no_access') return result;
  return KEPT_ON_NO_ACCESS.includes(String(currentStatus)) ? String(currentStatus) : 'problem';
}
