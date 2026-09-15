// src/lib/utils/obligationEvidence.js
//
// Which occurrence stack discharges a statutory obligation (migration 203's
// `evidenced_by`). Pure, no I/O — Type-1 testable, and shared by every surface
// that lists obligations, the same way inspectionSchedule.js is shared.
//
// Why this exists at all: `statutory_obligations` (formerly
// `inspection_definitions`) holds BOTH inspection-walk obligations and
// contractor-job ones — see
// docs/requirements/build_plans/Obligation_Library_Promotion_Build_Plan.md §5. The mobile
// app loads every row of that table into its start-a-walk list, so without a
// route filter a "6-monthly fire alarm service" would appear as something an
// inspector can walk round and tick — and read "never run, due now" forever,
// because it can never have a closed walk session.

/** @typedef {{ evidenced_by?: string|null }} Obligation */

export const EVIDENCE_ROUTES = ['inspection', 'maintenance_job', 'either'];

export const EVIDENCE_ROUTE_LABEL = {
  inspection:      'Inspection walk',
  maintenance_job: 'Contractor job',
  either:          'Either route',
};

/**
 * The route, defaulting to 'inspection' when absent.
 *
 * The default is load-bearing rather than defensive tidiness: the mobile app
 * caches definitions in IndexedDB, so a payload written BEFORE migration 203
 * has no `evidenced_by` at all. Treating that as 'inspection' means a stale
 * cache behaves exactly as it did before the column existed, instead of
 * silently emptying the walk list.
 * @param {Obligation} obligation
 */
export function evidenceRoute(obligation) {
  const route = obligation?.evidenced_by;
  return EVIDENCE_ROUTES.includes(route) ? route : 'inspection';
}

/** Discharged by an inspection walk (so: startable, and on the walk due list). */
export function isWalkEvidenced(obligation) {
  const route = evidenceRoute(obligation);
  return route === 'inspection' || route === 'either';
}

/** Discharged by a contractor job (so: offered by the Maintenance scheduler). */
export function isJobEvidenced(obligation) {
  const route = evidenceRoute(obligation);
  return route === 'maintenance_job' || route === 'either';
}
