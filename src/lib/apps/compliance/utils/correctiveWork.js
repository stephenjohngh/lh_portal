// src/lib/apps/compliance/utils/correctiveWork.js
//
// OPEN FAULTS, counted beside the compliance position and never inside it.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// `compliance_vocabulary.md` §6b split work on two axes: ORIGIN (preventive
// from the plan · corrective from a finding · a one-off somebody assigned) and
// ROUTE (in-house walk · contractor visit). The compliance position report
// covers the preventive half only — it is built from planned obligations, and
// a planned obligation is how a duty is discharged.
//
// ⛔ CORRECTIVE WORK DISCHARGES NO DUTY, so it must never be added to those
// figures. A building with every cycle on schedule and nine failed components
// is not compliant-and-tidy; it has an open fault list nobody is looking at.
// ⚠ And on this building that is not hypothetical: 18 components sit in failed
// or problem, and `maintenance_jobs` has never held a single row.
//
// ⭐ So: an ADJACENT band, with its own words, never summed with the
// obligation statuses. `PROJECT_STATUS.md` §6nn and the design doc §11.
//
// ── What it deliberately does NOT look at ───────────────────────────────────
// Only works schedules. A corrective MAINTENANCE JOB would also be real
// coverage, but a job reaches a component through `maintenance_job_components`,
// which this report does not load — and there are zero jobs, so wiring a second
// coverage source today would be machinery with no users (the mistake recorded
// against `outOfScope`). ⚠ The honesty is carried by the LABEL rather than by a
// caveat: the third figure says *no works schedule issued*, which stays true
// whatever else may be happening, instead of *nothing is being done*, which
// would not.

/** A component in one of these statuses is an open fault. */
export const FAULT_STATUSES = ['failed', 'problem'];

/**
 * ⛔ A DRAFT SCHEDULE IS NOT COVERAGE. It has not been sent, so nobody outside
 * this building knows the fault exists. Counting it would be the "reads
 * plausibly while saying something untrue" failure in its purest form — the
 * number goes green the moment somebody starts typing.
 */
export const COVERING_SCHEDULE_STATUSES = ['issued', 'completed'];

/**
 * @typedef {{ id: string, status?: string|null, asset_id?: string|null,
 *             label?: string|null, type_code?: string|null }} FaultComponent
 * @typedef {{ component_id: string, action?: string|null,
 *             schedule?: { id: string, title?: string|null, reference?: string|null,
 *                          status?: string|null } | null }} WorksItem
 */

/**
 * The open-fault band.
 *
 * @param {{ components?: FaultComponent[], worksItems?: WorksItem[] }} input
 * @returns {{
 *   open: number, failed: number, problem: number,
 *   covered: number, uncovered: number,
 *   rows: Array<FaultComponent & { schedules: Array<{ id: string, title: string|null,
 *           reference: string|null, status: string }> }>
 * }}
 */
export function correctiveSummary({ components = [], worksItems = [] } = {}) {
  // Coverage first, so the per-component lookup is one pass rather than a scan
  // per fault. Only schedules that have actually gone out count.
  /** @type {Map<string, Array<{id: string, title: string|null, reference: string|null, status: string}>>} */
  const covering = new Map();
  for (const item of worksItems) {
    const schedule = item?.schedule;
    if (!item?.component_id || !schedule?.id) continue;
    if (!COVERING_SCHEDULE_STATUSES.includes(schedule.status ?? '')) continue;
    const list = covering.get(item.component_id) ?? [];
    // A component can legitimately appear on two schedules (a quote and the
    // works that followed it). Dedupe by schedule id so the badge does not
    // repeat, but keep both when they are genuinely different schedules.
    if (!list.some(s => s.id === schedule.id)) {
      list.push({
        id: schedule.id,
        title: schedule.title ?? null,
        reference: schedule.reference ?? null,
        status: schedule.status ?? '',
      });
    }
    covering.set(item.component_id, list);
  }

  const rows = components
    .filter(c => c && FAULT_STATUSES.includes(c.status ?? ''))
    .map(c => ({ ...c, schedules: covering.get(c.id) ?? [] }));

  const covered = rows.filter(r => r.schedules.length > 0).length;

  return {
    open: rows.length,
    failed: rows.filter(r => r.status === 'failed').length,
    problem: rows.filter(r => r.status === 'problem').length,
    covered,
    uncovered: rows.length - covered,
    rows,
  };
}

/**
 * How a fault component reads on one line.
 *
 * ⚠ `asset_id` is missing on much of this building's register, which is a data
 * task rather than a code one (`PROJECT_STATUS.md` §6 item 7) — so the label
 * carries the weight and the asset id is an adornment, not the identity.
 * ⛔ Do not "fix" this by printing a uuid fragment: it identifies the row to
 * the database and nothing to a person.
 */
export function faultLabel(component) {
  const parts = [component?.label, component?.asset_id].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Unnamed component';
}
