// src/lib/utils/inspectionSchedule.js
// Read-time scheduling for configurable inspection definitions.
//
// Pure logic (no I/O) so all three surfaces — the mobile Inspection app, the
// Building Assets "Inspections" tab (Upcoming / Due), and the Admin config tab —
// derive identical due/overdue state from the same function. Definition-level
// scheduling: a definition's clock is (its most recent CLOSED session's
// closed_at) + frequency_days. No cron, no stored next_due to drift.
//
// ⚠ The due computation itself now lives in obligationSchedule.js, which
// generalises it across BOTH stacks (an obligation can also be discharged by a
// contractor job). This file is the walk-shaped door onto it, plus the display
// helpers. Behaviour here is unchanged — see computeInspectionSchedule's note.
//
// See docs/requirements/build_plans/Configurable_Inspections_Build_Plan.md §5 and
// docs/requirements/build_plans/Obligation_Library_Promotion_Build_Plan.md §7.

import { fmtDate } from '$lib/utils/dates';
import { computeObligationSchedule, walkEventsFromSessions } from '$lib/utils/obligationSchedule.js';

/**
 * @typedef {import('$lib/database.types').Tables<'statutory_obligations'>} InspectionDefinition
 * @typedef {import('$lib/database.types').Tables<'walk_sessions'>} WalkSession
 *
 * @typedef {Object} ScheduleState
 * @property {InspectionDefinition} definition
 * @property {string|null} lastRun        ISO of the last COMPLETED closed session, or null
 * @property {string|null} lastAttempt    ISO of the last closed session of any completeness, or null
 * @property {boolean}     unfinishedAttempt  the most recent closed session was left incomplete
 *                                            (finished early) and no complete run has happened since
 * @property {string|null} nextDue        ISO timestamp the definition is next due, or null
 * @property {boolean}     overdue        true when past due (or has a cadence but never run)
 * @property {number|null} daysUntilDue   whole days until due (negative = overdue); null when N/A
 * @property {'overdue'|'due_soon'|'ok'|'never_run'|'on_demand'} band
 * @property {number}      sortKey        due-time in ms for ordering (-Infinity sorts most-urgent first)
 */

/**
 * Compute the schedule state for each definition.
 *
 * @param {InspectionDefinition[]} definitions   statutory_obligations rows
 * @param {WalkSession[]} sessions               walk_sessions rows (only closed ones with a
 *                                               definition_id contribute; others are ignored)
 * @param {Object} [opts]
 * @param {Date}   [opts.now]          reference time (injectable for tests)
 * @param {number} [opts.dueSoonDays]  window (days) counted as "due soon" (default 14)
 * @returns {ScheduleState[]}          one entry per input definition, input order preserved
 */
export function computeInspectionSchedule(definitions, sessions, opts = {}) {
  // Delegates to the generalised obligation scheduler (P2 of the promotion
  // plan). This is a mapping layer, not a second implementation: walk sessions
  // become 'completed'/'attempted' evidence events and never 'planned' ones, so
  // the planned branch there cannot fire and this function's behaviour is
  // unchanged BY CONSTRUCTION rather than by assertion. The tests below this
  // file's callers are the regression net for that claim.
  //
  // Kept as its own export because "the inspection walk schedule" is a real,
  // narrower question three surfaces ask, and because every existing caller
  // passes sessions, not events.
  return computeObligationSchedule(definitions, walkEventsFromSessions(sessions), opts);
}

/**
 * Human label for a frequency_days value. Mirrors the preset chips in the
 * Admin definition editor; null = on-demand (no cadence).
 *
 * ⚠ `maintenance/utils/maintenanceHelpers.js` has its own `frequencyLabel`.
 * The two are kept in agreement — same labels for the same day counts — but
 * they are still two implementations of one job, which is the shape that
 * produced the addDaysISO bug. Worth consolidating; until then, change both.
 * The longer cadences below exist because the statutory template introduces
 * them (six-monthly servicing, five-yearly EICRs), and "Every 1825 days" is
 * not how anyone describes an EICR.
 * @param {number|null|undefined} days
 * @returns {string}
 */
export function frequencyLabel(days) {
  if (days == null) return 'On demand';
  return {
    1: 'Daily',
    7: 'Weekly',
    30: 'Monthly',    31: 'Monthly',
    60: '2-Monthly',
    90: 'Quarterly',  91: 'Quarterly',
    180: '6-Monthly', 182: '6-Monthly', 183: '6-Monthly',
    365: 'Annual',    366: 'Annual',
    730: '2-Yearly',
    1825: '5-Yearly',
  }[days] ?? `Every ${days} days`;
}

/**
 * One-line human description of a schedule state's due status. Shared by the
 * Building Assets Upcoming/Due panel and the mobile session-start list so the
 * wording never diverges.
 * @param {ScheduleState} st
 * @returns {string}
 */
export function scheduleDueText(st) {
  switch (st.band) {
    case 'on_demand': return 'Run any time';
    case 'never_run': return 'Never run — due now';
    case 'overdue': {
      const d = -st.daysUntilDue;
      return `Due ${fmtDate(st.nextDue)} · ${d} day${d === 1 ? '' : 's'} overdue`;
    }
    default:
      if (st.daysUntilDue === 0) return 'Due today';
      return `Due ${fmtDate(st.nextDue)} · in ${st.daysUntilDue} day${st.daysUntilDue === 1 ? '' : 's'}`;
  }
}

/**
 * Order schedule states by the definition's Display order (presentation_order,
 * set in Admin → Inspections), name as tiebreak.
 *
 * This is what the UI uses: the mobile start list, the Building Assets
 * Upcoming/Due panel and the Inspections filter all present definitions in the
 * SAME, user-controlled order, so an inspection is always in the position the
 * admin put it. Urgency is still visible on each row (band + due text +
 * the "N due" count) — it just no longer reorders the list.
 *
 * Name is a real tiebreak, not decoration: definitions created before the
 * Display order input existed all sit at 0, and equal orders would otherwise
 * come back in whatever sequence the DB chose.
 *
 * Returns a new array; does not mutate the input.
 *
 * @param {ScheduleState[]} states
 * @returns {ScheduleState[]}
 */
export function sortByDisplayOrder(states) {
  return [...(states ?? [])].sort((a, b) =>
    (a.definition?.presentation_order ?? 0) - (b.definition?.presentation_order ?? 0)
    || (a.definition?.name ?? '').localeCompare(b.definition?.name ?? ''));
}

/**
 * Order most-urgent first: never-run and overdue at the top (by due time), then
 * due-soon / ok by due date, on-demand last, name as tiebreak.
 *
 * NOT currently used by any screen — the UI switched to sortByDisplayOrder so
 * every surface presents inspections in the admin-controlled order. Kept
 * because `sortKey` encodes the urgency ordering and this is the canonical way
 * to apply it; use it if a "worklist by urgency" view is ever wanted.
 *
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
