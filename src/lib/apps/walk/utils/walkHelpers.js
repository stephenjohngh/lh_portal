// src/lib/apps/walk/utils/walkHelpers.js
// Shared utility functions for Walk app components and report servers.
// FIX: Changed all references from .result to .inspection_result

/**
 * Aggregate pass/fail/na counts and unique element count from an inspection array.
 * @param {Array} inspections — element_inspections rows
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

/**
 * Group inspection rows by plan_element_id.
 * Result is sorted: failures first, then by asset_id (numeric-aware).
 *
 * @param {Array} rows — element_inspections rows
 * @returns {Array<{ element_id, asset_id, subtype, rows }>}
 */
export function groupByElement(rows) {
  const map = {};
  for (const row of rows) {
    const elementId = row.plan_element_id;
    if (!map[elementId]) {
      map[elementId] = {
        element_id: elementId,
        asset_id:   row.asset_id,
        subtype:    row.subtype,
        rows:       [],
      };
    }
    map[elementId].rows.push(row);
  }
  return Object.values(map).sort((a, b) => {
    const aFail = a.rows.some(r => r.inspection_result === 'fail');
    const bFail = b.rows.some(r => r.inspection_result === 'fail');
    if (aFail !== bFail) return aFail ? -1 : 1;
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });
}

/**
 * Return the worst result across a set of inspection rows for one element.
 * Priority: fail > pass > na
 * @param {Array} rows — inspection rows for a single element
 * @returns {'fail'|'pass'|'na'}
 */
export function worstResult(rows) {
  if (rows.some(r => r.inspection_result === 'fail')) return 'fail';
  if (rows.some(r => r.inspection_result === 'pass')) return 'pass';
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
