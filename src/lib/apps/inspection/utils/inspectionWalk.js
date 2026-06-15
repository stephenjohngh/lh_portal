// src/lib/apps/inspection/utils/inspectionWalk.js
// Pure helpers for building and measuring an inspection walk's component list.
// Extracted from inspectionStore so they can be unit-tested in isolation — no
// store, supabase, or DOM access; everything comes in as arguments.

// -- Build walk component list -------------------------------------------------
// Given the full components list for a floor and the session's type_filter +
// emergency_only, returns the filtered and sorted component list for walking.
export function buildWalkComponents(floorComponents, typeFilter, emergencyOnly, allComponentAttrs = {}) {
  let list = floorComponents.filter(c => {
    // Walk order 0 marks an "internal / not on the walk" component (e.g. inside
    // a riser or ceiling void) — exclude it from every inspection walk and from
    // the progress counts. An unset/blank order (null) stays walkable and just
    // sorts to the end below, so components without an assigned order aren't
    // accidentally hidden.
    if (c.inspection_sort_order != null && Number(c.inspection_sort_order) === 0) return false;
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

// -- First non-empty floor helper ----------------------------------------------
// Scans buildingFloors from startIndex in direction (+1 or -1) and returns the
// first floor that has at least one matching component, plus its component list.
// Returns null if no such floor exists.
export function firstNonEmptyFloor(buildingFloors, allComponents, typeFilter, emergencyOnly, allComponentAttrs, startIndex, direction = 1) {
  for (let i = startIndex; i >= 0 && i < buildingFloors.length; i += direction) {
    const comps = buildWalkComponents(
      allComponents[buildingFloors[i].id] ?? [], typeFilter, emergencyOnly, allComponentAttrs
    );
    if (comps.length > 0) return { floor: buildingFloors[i], components: comps, index: i };
  }
  return null;
}

// -- Floor progress helpers ----------------------------------------------------

export function initFloorProgress(buildingFloors, allComponents, typeFilter, emergencyOnly, allComponentAttrs) {
  const progress = {};
  for (const floor of buildingFloors) {
    const comps = buildWalkComponents(
      allComponents[floor.id] ?? [], typeFilter, emergencyOnly, allComponentAttrs
    );
    progress[floor.id] = { inspected: 0, total: comps.length };
  }
  return progress;
}

export function calcFloorProgress(buildingFloors, allComponents, typeFilter, emergencyOnly, allComponentAttrs, inspections) {
  const progress = {};
  for (const floor of buildingFloors) {
    const comps = buildWalkComponents(
      allComponents[floor.id] ?? [], typeFilter, emergencyOnly, allComponentAttrs
    );
    progress[floor.id] = {
      total:     comps.length,
      inspected: comps.filter(c => inspections[c.id]).length,
    };
  }
  return progress;
}
