// src/lib/apps/inspection/utils/inspectionHelpers.js
// Helpers for v2 component_inspections schema.
// Key differences from v1:
//   - Rows use component_id (not plan_element_id)
//   - Rows join to components → component_types + floors
//   - photo_urls is a jsonb array (not photo_url string)
//   - checklist_results is a jsonb object { type_attribute_id: boolean }

import { getFloorOrder } from '$lib/utils/floorSorting';
import { resultRank as _resultRank, resultLabel as _resultLabel } from '$lib/apps/v2/utils/resultConstants.js';
import { sortByFloorAsset } from '$lib/apps/v2/utils/componentSorting.js';

// Re-export so callers that already import these from here keep working.
export { resultLabel, resultRank } from '$lib/apps/v2/utils/resultConstants.js';

// ── Flatten ───────────────────────────────────────────────────────────────────
// Promotes nested join fields to the top level.
// Raw row from loadSessionInspections join:
//   component_inspections row
//     + component: components!component_id {
//         asset_id, label, type_code, status,
//         floor: floors!floor_id { short_name, level_order }
//       }
export function flattenInspectionRows(rows) {
  return rows.map(r => ({
    ...r,
    asset_id:    r.component?.asset_id          ?? r.asset_id    ?? null,
    label:       r.component?.label             ?? r.label       ?? null,
    type_code:   r.component?.type_code         ?? r.type_code   ?? null,
    // type_name is not available from DB join (type_code is not a FK).
    // Components that need type display resolve it client-side from the types array.
    type_name:   r.type_name                    ?? null,
    floor_name:  r.component?.floor?.short_name ?? r.floor_name  ?? null,
    floor_order: r.component?.floor?.level_order ?? 999,
    result:      r.inspection_result            ?? r.result      ?? null,
    photo_urls:  r.photo_urls                   ?? [],
  }));
}

// ── Group by component ────────────────────────────────────────────────────────
// Returns array of { component_id, asset_id, label, type_code, type_name,
//                    floor_name, floor_order, rows[] }
// Sorted: failed → problem → ok → inactive, then floor order, then asset_id.
export function groupByComponent(rows) {
  const map = {};
  for (const row of rows) {
    const key = row.component_id;
    if (!map[key]) {
      map[key] = {
        component_id: key,
        asset_id:    row.asset_id    ?? null,
        label:       row.label       ?? null,
        type_code:   row.type_code   ?? null,
        type_name:   row.type_name   ?? null,
        floor_name:  row.floor_name  ?? null,
        floor_order: row.floor_order ?? 999,
        rows: [],
      };
    }
    map[key].rows.push({ ...row, result: row.inspection_result ?? row.result });
  }
  return Object.values(map).sort((a, b) => {
    const rankA = _resultRank(worstResult(a.rows));
    const rankB = _resultRank(worstResult(b.rows));
    if (rankA !== rankB) return rankA - rankB;
    return sortByFloorAsset(a, b);
  });
}

// ── Session stats ─────────────────────────────────────────────────────────────
export function sessionStats(inspections) {
  return {
    ok:       inspections.filter(r => (r.result ?? r.inspection_result) === 'ok').length,
    failed:   inspections.filter(r => (r.result ?? r.inspection_result) === 'failed').length,
    problem:  inspections.filter(r => (r.result ?? r.inspection_result) === 'problem').length,
    inactive: inspections.filter(r => (r.result ?? r.inspection_result) === 'inactive').length,
    components: new Set(inspections.map(r => r.component_id)).size,
    total:    inspections.length,
  };
}

// ── Worst result in a group ───────────────────────────────────────────────────
export function worstResult(rows) {
  if (rows.some(r => r.result === 'failed'))  return 'failed';
  if (rows.some(r => r.result === 'problem')) return 'problem';
  if (rows.some(r => r.result === 'ok'))      return 'ok';
  return 'inactive';
}

// ── Component display name ────────────────────────────────────────────────────
// Returns e.g. "G / FD-042" (floor short_name / asset_id)
export function componentDisplayName(component, floor) {
  const floorName = floor?.short_name ?? component?.floor?.short_name ?? '?';
  const id        = component?.asset_id || component?.label || '?';
  return `${floorName} / ${id}`;
}

// ── Session floor label ───────────────────────────────────────────────────────
export function sessionFloorLabel(session, floors) {
  if (!session.floor_id) return 'All Floors';
  const floor = floors?.find(f => f.id === session.floor_id);
  return floor ? `Floor ${floor.short_name}` : 'Floor ?';
}

// ── Preset label ─────────────────────────────────────────────────────────────
export function presetLabel(preset) {
  return {
    custom:              'Custom',
    emergency_lighting:  'Emergency Lighting',
    fire_doors:          'Fire Doors',
    apartment_doors:     'Apartment Doors',
  }[preset] ?? preset;
}
