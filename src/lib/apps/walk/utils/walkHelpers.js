// src/lib/apps/walk/utils/walkHelpers.js
// Shared utility functions for Walk app components and report servers.
// Eliminates duplication across WalkSessionSummary, WalkInspectionsTab,
// WalkInspectionsReport, and generate-inspections-report.

import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';
import { getFloorOrder } from '$lib/utils/floorSorting';

/**
 * Flatten the nested element join onto each walk_element_inspections row.
 * Called after any api.get() that uses the standard join:
 *   element:plan_elements!plan_element_id(asset_id, subtype, label, element_type, plan:plans!plan_id(floor_level))
 *
 * Safe to call on already-flattened rows — ?? fallbacks preserve existing values.
 *
 * @param {Array} rows — raw rows from walk_element_inspections with element join
 * @returns {Array} rows with asset_id, subtype, label, element_type, floor_level,
 *                  and result all available as top-level fields
 */
export function flattenInspectionRows(rows) {
  return rows.map(r => ({
    ...r,
    asset_id:     r.element?.asset_id         ?? r.asset_id     ?? null,
    subtype:      r.element?.subtype          ?? r.subtype      ?? null,
    label:        r.element?.label            ?? r.label        ?? null,
    element_type: r.element?.element_type     ?? r.element_type ?? null,
    floor_level:  r.element?.plan?.floor_level ?? r.floor_level ?? null,
    result:       r.inspection_result         ?? r.result       ?? null,
  }));
}

/**
 * Human-readable label for an element type value.
 * @param {string} type — e.g. 'communal_door'
 * @returns {string} e.g. 'Communal Door'
 */
export function getTypeLabel(type) {
  return ELEMENT_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

/**
 * Emoji icon for an element type value.
 * @param {string} type — e.g. 'light'
 * @returns {string} e.g. '💡'
 */
export function getTypeIcon(type) {
  return ELEMENT_TYPE_OPTIONS.find(o => o.value === type)?.icon ?? '■';
}

/**
 * Human-readable session location string.
 * Returns 'All Floors' for building-wide sessions (floor_level is NULL).
 * @param {object} session — walk_sessions row
 * @returns {string} e.g. 'Floor G' or 'All Floors'
 */
export function sessionFloorLabel(session) {
  return session.floor_level ? `Floor ${session.floor_level}` : 'All Floors';
}

/**
 * Aggregate pass/fail/etc counts and unique element count from a
 * walk_element_inspections array.
 * Reads `result` if present (flattened rows), falls back to `inspection_result` (raw rows).
 *
 * @param {Array} inspections — walk_element_inspections rows (raw or flattened)
 * @returns {{ ..., elements, total }}
 */
export function sessionStats(inspections) {
  return {
    OK:     inspections.filter(r => (r.result ?? r.inspection_result) === 'OK').length,
    failed:     inspections.filter(r => (r.result ?? r.inspection_result) === 'Failed').length,
    problem:   inspections.filter(r => (r.result ?? r.inspection_result) === 'Problem').length,
    inactive:       inspections.filter(r => (r.result ?? r.inspection_result) === 'Inactive').length,
    elements: new Set(inspections.map(r => r.plan_element_id)).size,
    total:    inspections.length,
  };
}

/**
 * Group inspection rows by plan_element_id.
 * Result is sorted: failures first, then by floor_level, then by asset_id (numeric-aware).
 * For single-plan sessions all rows share the same floor so sort degrades to asset_id only.
 *
 * @param {Array} rows — walk_element_inspections rows (floor_level must be flattened onto each row)
 * @returns {Array<{ element_id, asset_id, subtype, label, element_type, floor_level, rows }>}
 */
export function groupByElement(rows) {
  const map = {};
  for (const row of rows) {
    const key = row.plan_element_id;
    if (!map[key]) {
      map[key] = {
        element_id:  key,
        asset_id:     row.asset_id     ?? null,
        subtype:      row.subtype      ?? null,
        label:        row.label        ?? null,
        element_type: row.element_type ?? null,
        floor_level:  row.floor_level  ?? null,
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
    const aFail   = a.rows.some(r => r.result === 'failed');
    const bFail   = b.rows.some(r => r.result === 'failed');
    if (aFail !== bFail) return aFail ? -1 : 1;
    const aRepair = a.rows.some(r => r.result === 'problem');
    const bRepair = b.rows.some(r => r.result === 'problem');
    if (aRepair !== bRepair) return aRepair ? -1 : 1;
    const aFloor = getFloorOrder(a.floor_level);
    const bFloor = getFloorOrder(b.floor_level);
    if (aFloor !== bFloor) return aFloor - bFloor;
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });
}

/**
 * Return the worst result across a set of inspection rows for one element.
 * Priority: fail > pass > na
 * @param {Array} rows — inspection rows for a single element (with .result normalised)
 * @returns
 */
export function worstResult(rows) {
  if (rows.some(r => r.result === 'failed'))   return 'failed';
  if (rows.some(r => r.result === 'problem')) return 'problem';
  if (rows.some(r => r.result === 'OK'))   return 'OK';
  return 'inactive';
}

/**
 * Human-readable result label. result
 */
export function resultLabel(result) {
  return { OK: '✓ PASS', failed: '✗ FAIL', problem: '⚙ PROBLEM', inactive: '— INACTIVE' }[result] ?? result;
}

/**
 * Numeric sort rank for result priority (used for sorting lists).
 */
export function resultRank(result) {
  return { failed: 0, problem: 1, OK: 2, inactive: 3 }[result] ?? 4;
}
