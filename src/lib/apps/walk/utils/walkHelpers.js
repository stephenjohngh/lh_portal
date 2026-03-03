// src/lib/apps/walk/utils/walkHelpers.js
// Shared utility functions for Walk app components and report servers.
// FIX: Uses inspection field constants to prevent field name bugs

import { INSPECTION_FIELDS, INSPECTION_RESULTS, getResultLabel } from './inspectionFields.js';

/**
 * Aggregate pass/fail/na counts and unique element count from an inspection array.
 * @param {Array} inspections — element_inspections rows
 * @returns {{ pass, fail, na, elements, total }}
 */
export function sessionStats(inspections) {
  return {
    pass:     inspections.filter(r => r[INSPECTION_FIELDS.RESULT] === INSPECTION_RESULTS.PASS).length,
    fail:     inspections.filter(r => r[INSPECTION_FIELDS.RESULT] === INSPECTION_RESULTS.FAIL).length,
    na:       inspections.filter(r => r[INSPECTION_FIELDS.RESULT] === INSPECTION_RESULTS.NA).length,
    elements: new Set(inspections.map(r => r[INSPECTION_FIELDS.ELEMENT_ID])).size,
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
    const elementId = row[INSPECTION_FIELDS.ELEMENT_ID];
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
    const aFail = a.rows.some(r => r[INSPECTION_FIELDS.RESULT] === INSPECTION_RESULTS.FAIL);
    const bFail = b.rows.some(r => r[INSPECTION_FIELDS.RESULT] === INSPECTION_RESULTS.FAIL);
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
  if (rows.some(r => r[INSPECTION_FIELDS.RESULT] === INSPECTION_RESULTS.FAIL)) return INSPECTION_RESULTS.FAIL;
  if (rows.some(r => r[INSPECTION_FIELDS.RESULT] === INSPECTION_RESULTS.PASS)) return INSPECTION_RESULTS.PASS;
  return INSPECTION_RESULTS.NA;
}

/**
 * Human-readable result label.
 * @param {'pass'|'fail'|'na'} result
 */
export function resultLabel(result) {
  return getResultLabel(result);
}

/**
 * Numeric sort rank for result priority (used for sorting lists).
 * fail = 0 (highest priority), pass = 1, na = 2
 */
export function resultRank(result) {
  const ranks = {
    [INSPECTION_RESULTS.FAIL]: 0,
    [INSPECTION_RESULTS.PASS]: 1,
    [INSPECTION_RESULTS.NA]: 2
  };
  return ranks[result] ?? 3;
}
