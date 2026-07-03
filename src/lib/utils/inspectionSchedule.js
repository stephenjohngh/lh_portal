// src/lib/utils/inspectionSchedule.js
// Read-time scheduling for configurable inspection definitions.
//
// Pure logic (no I/O) so all three surfaces — the mobile Inspection app, the
// Building Assets "Inspections" tab (Upcoming / Due), and the Admin config tab —
// derive identical due/overdue state from the same function. Definition-level
// scheduling: a definition's clock is (its most recent CLOSED session's
// closed_at) + frequency_days. No cron, no stored next_due to drift.
//
// See docs/requirements/Configurable_Inspections_Build_Plan.md §5.

const DAY_MS = 86_400_000;

/**
 * @typedef {import('$lib/database.types').Tables<'inspection_definitions'>} InspectionDefinition
 * @typedef {import('$lib/database.types').Tables<'walk_sessions'>} WalkSession
 *
 * @typedef {Object} ScheduleState
 * @property {InspectionDefinition} definition
 * @property {string|null} lastRun        ISO timestamp of the last closed session, or null
 * @property {string|null} nextDue        ISO timestamp the definition is next due, or null
 * @property {boolean}     overdue        true when past due (or has a cadence but never run)
 * @property {number|null} daysUntilDue   whole days until due (negative = overdue); null when N/A
 * @property {'overdue'|'due_soon'|'ok'|'never_run'|'on_demand'} band
 * @property {number}      sortKey        due-time in ms for ordering (-Infinity sorts most-urgent first)
 */

/**
 * Compute the schedule state for each definition.
 *
 * @param {InspectionDefinition[]} definitions   inspection_definitions rows
 * @param {WalkSession[]} sessions               walk_sessions rows (only closed ones with a
 *                                               definition_id contribute; others are ignored)
 * @param {Object} [opts]
 * @param {Date}   [opts.now]          reference time (injectable for tests)
 * @param {number} [opts.dueSoonDays]  window (days) counted as "due soon" (default 14)
 * @returns {ScheduleState[]}          one entry per input definition, input order preserved
 */
export function computeInspectionSchedule(definitions, sessions, opts = {}) {
  const now         = opts.now ?? new Date();
  const nowMs       = now.getTime();
  const dueSoonDays = opts.dueSoonDays ?? 14;

  // Most recent closed_at per definition_id.
  /** @type {Record<string, number>} */
  const lastRunMs = {};
  for (const s of sessions ?? []) {
    if (!s || s.status !== 'closed' || !s.definition_id || !s.closed_at) continue;
    const t = new Date(s.closed_at).getTime();
    if (Number.isNaN(t)) continue;
    if (lastRunMs[s.definition_id] === undefined || t > lastRunMs[s.definition_id]) {
      lastRunMs[s.definition_id] = t;
    }
  }

  return (definitions ?? []).map((definition) => {
    const freq  = definition.frequency_days;
    const lastT = lastRunMs[definition.id];
    const lastRun = lastT !== undefined ? new Date(lastT).toISOString() : null;

    // On-demand: no cadence → never "due".
    if (freq == null) {
      return {
        definition, lastRun, nextDue: null, overdue: false,
        daysUntilDue: null, band: /** @type {const} */ ('on_demand'),
        sortKey: Infinity,
      };
    }

    // Has a cadence but never run → due now, most urgent.
    if (lastT === undefined) {
      return {
        definition, lastRun: null, nextDue: null, overdue: true,
        daysUntilDue: null, band: /** @type {const} */ ('never_run'),
        sortKey: -Infinity,
      };
    }

    const nextDueMs    = lastT + freq * DAY_MS;
    const overdue      = nextDueMs < nowMs;
    const daysUntilDue = Math.ceil((nextDueMs - nowMs) / DAY_MS);
    const band = overdue
      ? 'overdue'
      : (daysUntilDue <= dueSoonDays ? 'due_soon' : 'ok');

    return {
      definition, lastRun,
      nextDue: new Date(nextDueMs).toISOString(),
      overdue, daysUntilDue,
      band: /** @type {'overdue'|'due_soon'|'ok'} */ (band),
      sortKey: nextDueMs,
    };
  });
}

/**
 * Order schedule states most-urgent first: never-run and overdue at the top
 * (by due time), then due-soon / ok by due date, on-demand last, name as tiebreak.
 * Returns a new array; does not mutate the input.
 *
 * @param {ScheduleState[]} states
 * @returns {ScheduleState[]}
 */
export function sortBySchedule(states) {
  return [...(states ?? [])].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return (a.definition?.name ?? '').localeCompare(b.definition?.name ?? '');
  });
}
