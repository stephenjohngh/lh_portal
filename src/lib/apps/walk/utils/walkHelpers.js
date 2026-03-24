// src/lib/apps/walk/utils/walkHelpers.js
import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';
import { getFloorOrder } from '$lib/utils/floorSorting';

export function flattenInspectionRows(rows) {
  return rows.map(r => ({
    ...r,
    asset_id:     r.element?.asset_id          ?? r.asset_id     ?? null,
    subtype:      r.element?.subtype           ?? r.subtype      ?? null,
    label:        r.element?.label             ?? r.label        ?? null,
    element_type: r.element?.element_type      ?? r.element_type ?? null,
    floor_level:  r.element?.plan?.floor_level ?? r.floor_level  ?? null,
    result:       r.inspection_result          ?? r.result       ?? null,
  }));
}

export function getTypeLabel(type) {
  return ELEMENT_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

export function getTypeIcon(type) {
  return ELEMENT_TYPE_OPTIONS.find(o => o.value === type)?.icon ?? '■';
}

export function sessionFloorLabel(session) {
  return session.floor_level ? `Floor ${session.floor_level}` : 'All Floors';
}

export function sessionStats(inspections) {
  return {
    OK:       inspections.filter(r => (r.result ?? r.inspection_result) === 'OK').length,
    failed:   inspections.filter(r => (r.result ?? r.inspection_result) === 'failed').length,
    problem:  inspections.filter(r => (r.result ?? r.inspection_result) === 'problem').length,
    inactive: inspections.filter(r => (r.result ?? r.inspection_result) === 'inactive').length,
    elements: new Set(inspections.map(r => r.plan_element_id)).size,
    total:    inspections.length,
  };
}

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

export function worstResult(rows) {
  if (rows.some(r => r.result === 'failed'))  return 'failed';
  if (rows.some(r => r.result === 'problem')) return 'problem';
  if (rows.some(r => r.result === 'OK'))      return 'OK';
  return 'inactive';
}

export function resultLabel(result) {
  return { OK: '✓ PASS', failed: '✗ FAIL', problem: '⚙ PROBLEM', inactive: '— INACTIVE' }[result] ?? result;
}

export function resultRank(result) {
  return { failed: 0, problem: 1, OK: 2, inactive: 3 }[result] ?? 4;
}
