// src/lib/apps/building_assets/utils/inspectionScope.js
// Apply an inspection_definitions.scope (stored as JSON) to the component list.
//
// A definition's `scope` is the same multi-criteria filter the Components tab
// uses — we adapt the stored array shape into the Set-based criteria that the
// battle-tested filterComponents() pipeline expects, so scope resolution and
// the Components-tab filter can never diverge. Used by the Admin editor's live
// "matches N components" preview and (Phase 1) the walk builder.
//
// scope shape (all optional):
//   { typeCodes: string[], systemIds: string[], floorIds: string[],
//     statuses: string[], fixedAttrFilters: [{name,value|values}],
//     conditionAttrFilters: [{name,value|values}] }
//
// ctx: { types, attrDefs, componentAttrs, inspections } — same as filterComponents.
import { filterComponents } from './componentsFilter.js';

/** Convert a stored scope (arrays) into filterComponents criteria (Sets). */
export function scopeToCriteria(scope = {}) {
  const floorIds = scope.floorIds ?? [];
  return {
    floorPreset:         floorIds.length ? 'custom' : 'all',
    residentialFloorIds: new Set(),
    basementFloorIds:    new Set(),
    filterFloorIds:      new Set(floorIds),
    filterSystemIds:     new Set(scope.systemIds ?? []),
    filterTypeCodes:     new Set(scope.typeCodes ?? []),
    filterStatuses:      new Set(scope.statuses ?? []),
    searchQuery:         '',
    fixedAttrFilters:     scope.fixedAttrFilters     ?? [],
    conditionAttrFilters: scope.conditionAttrFilters ?? [],
  };
}

/**
 * @param {Array}  components
 * @param {object} scope  inspection_definitions.scope
 * @param {object} ctx    { types, attrDefs, componentAttrs, inspections }
 * @returns {Array} components matching the scope
 */
export function applyInspectionScope(components, scope, ctx) {
  return filterComponents(components ?? [], scopeToCriteria(scope), ctx);
}

/** True when the scope carries no constraints (matches everything). */
export function isEmptyScope(scope = {}) {
  return !(
    (scope.typeCodes?.length) || (scope.systemIds?.length) ||
    (scope.floorIds?.length)  || (scope.statuses?.length)  ||
    (scope.fixedAttrFilters?.length) || (scope.conditionAttrFilters?.length)
  );
}
