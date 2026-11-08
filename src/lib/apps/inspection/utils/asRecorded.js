// src/lib/apps/inspection/utils/asRecorded.js
//
// A past result, read as it was (migration 285). Each result keeps its component in
// `as_recorded` and names the set of checks it was judged against; the Inspection
// app's accessors put that set on the row as `recorded_checks`.
//
// A result written before migration 285 has neither, so it falls back to today's
// definitions and says so (`fromSnapshot: false`). An answer whose check cannot be
// found is shown as unknown: it used to drop out of the report without a word.
//
// Pure.

import { isReadingDef } from '#lib/apps/building_assets/lookups.js';
import { recordedCheckApplies } from '#lib/apps/building_assets/utils/checkApplies.js';

export const UNKNOWN_CHECK = 'A check no longer on the list';

const orderOf = (d) => d.order ?? d.presentation_order ?? 0;

/**
 * The checks this result was judged against, in their walk order.
 * @param {any} row
 * @param {any[]} [todayDefs]  the type's attributes today, for a result with no snapshot
 */
export function recordedChecks(row, todayDefs = []) {
  const fromSnapshot = Array.isArray(row?.recorded_checks);
  const checks = fromSnapshot ? row.recorded_checks : todayDefs.filter((d) => d.checkable);
  return { checks: [...checks].sort((a, b) => orderOf(a) - orderOf(b)), fromSnapshot };
}

/**
 * The answers on a result, each with the check as it stood. Same shape as
 * conditionChecklistDisplay and readingsDisplay.
 * A hidden check is listed only if it was answered.
 * @param {any} row
 * @param {any[]} [todayDefs]
 */
export function recordedAnswers(row, todayDefs = []) {
  const { checks, fromSnapshot } = recordedChecks(row, todayDefs);
  const results  = row?.checklist_results ?? {};
  const readings = row?.readings ?? {};
  const has = (v) => v !== undefined && v !== null && v !== '';

  // A check that did not apply to this component (migration 286) is not listed
  // unless answered: "not recorded" would read as a gap. Judged on the component as
  // it was recorded; with no record of it, a conditional check is left out.
  const fixed = row?.as_recorded?.fixed;
  const applied = (def) => (fromSnapshot && fixed ? recordedCheckApplies(def, fixed) : !def.applies_when?.length);

  const conditions = [];
  const measured   = [];
  for (const def of checks) {
    if (isReadingDef(def)) {
      if (has(readings[def.id])) measured.push({ def, value: readings[def.id] });
    } else {
      const passed = typeof results[def.id] === 'boolean' ? results[def.id] : null;
      if (passed !== null || (def.visible !== false && applied(def))) conditions.push({ def, passed });
    }
  }

  const known = new Set(checks.map((d) => d.id));
  for (const [id, passed] of Object.entries(results)) {
    if (!known.has(id) && typeof passed === 'boolean') conditions.push({ def: { id, name: UNKNOWN_CHECK }, passed });
  }
  for (const [id, value] of Object.entries(readings)) {
    if (!known.has(id) && has(value)) measured.push({ def: { id, name: UNKNOWN_CHECK }, value });
  }
  return { conditions, readings: measured, fromSnapshot };
}

/**
 * The component as it stood when this result was written, or null if not recorded.
 * @param {any} row
 * @returns {{ ref: string, asset_id: string|null, label: string|null, floor: string|null,
 *             floor_name: string|null, type_name: string|null, type_initial: string|null,
 *             fixed: Array<{ id: string, name: string, value: string|null }> }|null}
 */
export function recordedComponent(row) {
  const r = row?.as_recorded;
  if (!r?.ref) return null;
  return {
    ...r.component,
    ref: r.ref,
    type_initial: r.ref.split('/')[1] ?? null,
    fixed: r.fixed ?? [],
  };
}

/** How many of these results have no record of what they were judged against. */
export const withoutSnapshot = (rows) => (rows ?? []).filter((r) => !Array.isArray(r.recorded_checks)).length;

/**
 * Where a session's results came from.
 * @param {any} _session
 */
export const sourceLabel = (_session) => 'In-house walk';

/**
 * The line a document prints when some names are today's rather than the originals.
 * @param {number} count
 */
export function todaysNamesNote(count) {
  if (!count) return null;
  return `${count} result${count === 1 ? ' was' : 's were'} saved before check wording was kept, so `
    + 'check names and component details on those are today’s.';
}
