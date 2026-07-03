// src/lib/apps/inspection/utils/inspectionWalk.js
// Pure helpers for building and measuring an inspection walk's component list.
// Extracted from inspectionStore so they can be unit-tested in isolation — no
// store, supabase, or DOM access; everything comes in as arguments.
//
// Two ways to say "what is in this walk":
//   - legacy presets / ad-hoc: buildWalkComponents(typeFilter, emergencyOnly)
//   - inspection definitions:  buildWalkComponentsFromScope(scope, ctx) — the
//     definition's stored scope applied through the shared Components-tab
//     filter engine (applyInspectionScope), so a definition's walk always
//     matches the Admin editor's "matches N" preview.
// makeWalkBuilder() folds both into one (floorComponents) => walkList closure,
// which the floor-scanning helpers below take as their filter.

import { applyInspectionScope } from '$lib/apps/building_assets/utils/inspectionScope.js';

// Walk order 0 marks an "internal / not on the walk" component (e.g. inside
// a riser or ceiling void) — exclude it from every inspection walk and from
// the progress counts. An unset/blank order (null) stays walkable and just
// sorts to the end, so components without an assigned order aren't
// accidentally hidden.
function isWalkable(c) {
  return !(c.inspection_sort_order != null && Number(c.inspection_sort_order) === 0);
}

function sortWalkOrder(list) {
  return list.sort((a, b) => {
    const aO = a.inspection_sort_order ?? null;
    const bO = b.inspection_sort_order ?? null;
    // Explicit sort order first (nulls last)
    if (aO !== null && bO !== null) return aO - bO;
    if (aO !== null) return -1;
    if (bO !== null) return 1;
    // Both unset: fall back to asset_id
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });
}

// -- Build walk component list (legacy presets / ad-hoc) ------------------------
// Given the full components list for a floor and the session's type_filter +
// emergency_only, returns the filtered and sorted component list for walking.
export function buildWalkComponents(floorComponents, typeFilter, emergencyOnly, allComponentAttrs = {}) {
  const list = floorComponents.filter(c => {
    if (!isWalkable(c)) return false;
    // Type filter: must be in the selected type_codes array
    if (!typeFilter.includes(c.type_code)) return false;
    // Emergency-only: check component_attributes for attr_name='Emergency' (case-insensitive), value='true'
    // (attr_name is enriched into allComponentAttrs rows during load()).
    if (emergencyOnly) {
      const isEmergency = (allComponentAttrs[c.id] ?? [])
        .some(a => a.attr_name?.toLowerCase() === 'emergency' && a.value === 'true');
      if (!isEmergency) return false;
    }
    return true;
  });
  return sortWalkOrder(list);
}

// -- Build walk component list (inspection definition scope) --------------------
// Applies a definition's stored scope via the shared filter engine, then the
// walk exclusion + ordering.
// ctx: { types, attrDefs, componentAttrs, inspections } — same as filterComponents.
export function buildWalkComponentsFromScope(floorComponents, scope, ctx) {
  const walkable = (floorComponents ?? []).filter(isWalkable);
  return sortWalkOrder(applyInspectionScope(walkable, scope ?? {}, ctx));
}

/**
 * One (floorComponents) => walkList closure for a session's walk config —
 * definition-driven sessions apply the definition's scope, legacy/ad-hoc
 * sessions apply typeFilter + emergencyOnly.
 *
 * @param {{ definition?: object, typeFilter?: string[], emergencyOnly?: boolean }} walk
 * @param {{ types: Array, attrDefs: object, componentAttrs: object, inspections: object }} ctx
 * @returns {(floorComponents: Array) => Array}
 */
export function makeWalkBuilder(walk, ctx) {
  const { definition, typeFilter, emergencyOnly } = walk ?? {};
  if (definition) {
    return (floorComponents) => buildWalkComponentsFromScope(floorComponents, definition.scope, ctx);
  }
  return (floorComponents) =>
    buildWalkComponents(floorComponents ?? [], typeFilter ?? [], emergencyOnly ?? false, ctx?.componentAttrs ?? {});
}

// -- First non-empty floor helper ----------------------------------------------
// Scans buildingFloors from startIndex in direction (+1 or -1) and returns the
// first floor that has at least one matching component, plus its component list.
// Returns null if no such floor exists.
export function firstNonEmptyFloor(buildingFloors, allComponents, buildFn, startIndex, direction = 1) {
  for (let i = startIndex; i >= 0 && i < buildingFloors.length; i += direction) {
    const comps = buildFn(allComponents[buildingFloors[i].id] ?? []);
    if (comps.length > 0) return { floor: buildingFloors[i], components: comps, index: i };
  }
  return null;
}

// -- Floor progress helpers ----------------------------------------------------

export function initFloorProgress(buildingFloors, allComponents, buildFn) {
  const progress = {};
  for (const floor of buildingFloors) {
    const comps = buildFn(allComponents[floor.id] ?? []);
    progress[floor.id] = { inspected: 0, total: comps.length };
  }
  return progress;
}

export function calcFloorProgress(buildingFloors, allComponents, buildFn, inspections) {
  const progress = {};
  for (const floor of buildingFloors) {
    const comps = buildFn(allComponents[floor.id] ?? []);
    progress[floor.id] = {
      total:     comps.length,
      inspected: comps.filter(c => inspections[c.id]).length,
    };
  }
  return progress;
}
