// src/lib/apps/inspection/utils/inspectionHelpers.js
// Helpers for the component_inspections schema:
// flatten/group inspection rows, session stats, display helpers, preset labels.

import { resultRank as _resultRank, resultLabel as _resultLabel } from '$lib/utils/resultConstants.js';
import { sortByFloorAsset } from '$lib/utils/componentSorting.js';

// Re-export so callers that already import these from here keep working.
export { resultLabel, resultRank } from '$lib/utils/resultConstants.js';

// -- Flatten -------------------------------------------------------------------
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

// -- Group by component --------------------------------------------------------
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

// -- Session stats -------------------------------------------------------------
// `components` counts everything ADDRESSED (a no_access row is still an
// addressed component — it drives completeness). `observed` counts only those
// actually assessed. Reporting both is what stops "complete" hiding the fact
// that nobody got into two of the flats — see Inspection_Best_Practice_Review §G1.
export function sessionStats(inspections) {
  const resultOf = (r) => r.result ?? r.inspection_result;
  const count    = (v) => inspections.filter(r => resultOf(r) === v).length;
  const noAccess = count('no_access');
  const components = new Set(inspections.map(r => r.component_id)).size;
  return {
    ok:        count('ok'),
    failed:    count('failed'),
    problem:   count('problem'),
    inactive:  count('inactive'),
    no_access: noAccess,
    components,                          // addressed (incl. no access)
    observed:  components - new Set(
      inspections.filter(r => resultOf(r) === 'no_access').map(r => r.component_id),
    ).size,                              // actually assessed
    total:     inspections.length,
  };
}

// -- Worst result in a group ---------------------------------------------------
// Severity order mirrors RESULT_RANK. no_access sits above 'ok' — a component
// nobody could assess needs attention before one that passed — but below real
// defects. Checked BEFORE the 'inactive' fallback so that a component whose only
// record is a no-access attempt does not silently report as 'inactive'.
export function worstResult(rows) {
  if (rows.some(r => r.result === 'failed'))    return 'failed';
  if (rows.some(r => r.result === 'problem'))   return 'problem';
  if (rows.some(r => r.result === 'no_access')) return 'no_access';
  if (rows.some(r => r.result === 'ok'))        return 'ok';
  return 'inactive';
}

// -- Status before a session ---------------------------------------------------
// The status each component had BEFORE a session touched it — the "was" side of
// the walk card's status line.
//
// Needed only on RESUME. During a live walk recordInspection captures the prior
// status exactly, at the moment it overwrites components.status; once the walk
// is reloaded that value is gone, so it has to be reconstructed from inspection
// history: the result of the latest inspection recorded before the session
// started (an inspection result IS the status it set — applyInspectionResult
// writes them together).
//
// A component with no inspection before startedAt is deliberately ABSENT from
// the map rather than defaulting to its current status: its prior status is
// genuinely unknown (it predates any inspection), and the card shows "–" instead
// of asserting something false.
//
// @param {Array<{component_id: string, inspection_result: string, inspected_at: string}>} historyRows
// @param {string} startedAt - the session's started_at (ISO)
// @returns {Record<string, string>} { componentId: status }
export function statusBeforeSession(historyRows, startedAt) {
  const status = {};
  const at     = {};
  for (const r of historyRows ?? []) {
    if (!r.component_id || !r.inspection_result || !r.inspected_at) continue;
    // ISO-8601 UTC strings compare correctly lexicographically.
    if (startedAt && r.inspected_at >= startedAt) continue;   // this session's own rows
    if (!at[r.component_id] || r.inspected_at > at[r.component_id]) {
      at[r.component_id]     = r.inspected_at;
      status[r.component_id] = r.inspection_result;
    }
  }
  return status;
}

// NOTE: there is deliberately no component-display-name helper here. The portal
// has ONE component ref format — buildComponentRef() in $lib/utils/componentRef.js
// ("{floor}/{typeInitial}/{assetId}"), the same string component_links stores.
// A local "{floor} / {assetId}" variant used to live here; it dropped the type
// initial and drifted from every other surface. Use the shared builder.

// -- Session floor label -------------------------------------------------------
export function sessionFloorLabel(session, floors) {
  if (!session.floor_id) return 'All Floors';
  const floor = floors?.find(f => f.id === session.floor_id);
  return floor ? `Floor ${floor.short_name}` : 'Floor ?';
}

// -- Session definition name ---------------------------------------------------
// The inspection_definitions name driving this session (e.g. "Fire Doors"), or
// null for ad-hoc / repair sessions with no definition. Used to build the
// "{building} {definition} · {scope}" line — e.g. "LH Fire Doors · All Floors".
// @param {{ definition_id?: string|null }} session
// @param {Array<{ id: string, name: string }>} definitions
export function sessionDefinitionName(session, definitions) {
  if (!session?.definition_id) return null;
  return definitions?.find(d => d.id === session.definition_id)?.name ?? null;
}

// -- Preset label -------------------------------------------------------------
export function presetLabel(preset) {
  return {
    custom:              'Custom',
    emergency_lighting:  'Emergency Lighting',
    fire_doors:          'Fire Doors',
    apartment_doors:     'Apartment Doors',
  }[preset] ?? preset;
}
