// src/lib/apps/walk/utils/walkHelpers.js
// Shared utility functions for Walk app components and report servers.
// Eliminates duplication across WalkSessionSummary, WalkInspectionsTab,
// WalkInspectionsReport, and generate-inspections-report.

/**
 * Aggregate pass/fail/na counts and unique element count from a
 * walk_element_inspections array.
 *
 * NOTE: The DB column is `inspection_result`, not `result`.
 * We normalise here so callers can use `.result` throughout.
 *
 * @param {Array} inspections — walk_element_inspections rows
 * @returns {{ pass, fail, na, elements, total }}
 */
export function sessionStats(inspections) {
  return {
    pass:     inspections.filter(r => r.inspection_result === 'pass').length,
    fail:     inspections.filter(r => r.inspection_result === 'fail').length,
    na:       inspections.filter(r => r.inspection_result === 'na').length,
    elements: new Set(inspections.map(r => r.plan_element_id)).size,
    total:    inspections.length,
  };
}

// Floor sort order for building-wide session element grouping
const FLOOR_ORDER = { L: 0, U: 1, G: 2, '1': 3, '2': 4, '3': 5, '4': 6, '5': 7, '6': 8, '7': 9 };

/**
 * Group inspection rows by plan_element_id.
 * Result is sorted: failures first, then by floor_level, then by asset_id (numeric-aware).
 * For single-plan sessions all rows share the same floor so sort degrades to asset_id only.
 *
 * Normalises `plan_element_id` → `element_id` and
 * `inspection_result` → `result` on each row for convenience in templates.
 *
 * @param {Array} rows — walk_element_inspections rows (floor_level must be flattened onto each row)
 * @returns {Array<{ element_id, asset_id, subtype, label, floor_level, rows }>}
 */
export function groupByElement(rows) {
  const map = {};
  for (const row of rows) {
    const key = row.plan_element_id;
    if (!map[key]) {
      map[key] = {
        element_id:  key,
        asset_id:    row.asset_id    ?? null,
        subtype:     row.subtype     ?? null,
        label:       row.label       ?? null,
        floor_level: row.floor_level ?? null,
        rows:        [],
      };
    }
    // Normalise result field so templates can use row.result uniformly
    map[key].rows.push({
      ...row,
      result: row.inspection_result ?? row.result,
    });
  }
  return Object.values(map).sort((a, b) => {
    const aFail = a.rows.some(r => r.result === 'fail');
    const bFail = b.rows.some(r => r.result === 'fail');
    if (aFail !== bFail) return aFail ? -1 : 1;
    const aFloor = FLOOR_ORDER[a.floor_level] ?? 99;
    const bFloor = FLOOR_ORDER[b.floor_level] ?? 99;
    if (aFloor !== bFloor) return aFloor - bFloor;
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });
}

/**
 * Return the worst result across a set of inspection rows for one element.
 * Priority: fail > pass > na
 * @param {Array} rows — inspection rows for a single element (with .result normalised)
 * @returns {'fail'|'pass'|'na'}
 */
export function worstResult(rows) {
  if (rows.some(r => r.result === 'fail')) return 'fail';
  if (rows.some(r => r.result === 'pass')) return 'pass';
  return 'na';
}

/**
 * Human-readable result label.
 * @param {'pass'|'fail'|'na'} result
 */
export function resultLabel(result) {
  return { pass: '✓ PASS', fail: '✗ FAIL', na: '— N/A' }[result] ?? result;
}

/**
 * Numeric sort rank for result priority (used for sorting lists).
 * fail = 0 (highest priority), pass = 1, na = 2
 */
export function resultRank(result) {
  return { fail: 0, pass: 1, na: 2 }[result] ?? 3;
}
