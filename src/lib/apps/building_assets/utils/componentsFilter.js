// src/lib/apps/building_assets/utils/componentsFilter.js
// Pure filter pipeline for the Components tab. Extracted from
// ComponentsTab.svelte so the multi-criteria filtering (the core list logic)
// can be unit-tested without rendering. No store/DOM — all inputs passed in.
import { matchesAllAttrFilters } from './attrFilters.js';

/**
 * Apply the Components-tab filters to the full component list.
 *
 * @param {Array} components
 * @param {object} criteria  Sets where noted:
 *   { floorPreset:'all'|'residential'|'basement'|'custom',
 *     residentialFloorIds:Set, basementFloorIds:Set, filterFloorIds:Set,
 *     filterSystemIds:Set, filterTypeCodes:Set, filterStatuses:Set,
 *     searchQuery:string, fixedAttrFilters:Array, conditionAttrFilters:Array,
 *     spaceFilterIds:Set|null }   // null/absent = space filter inactive
 * @param {object} ctx  { types, attrDefs, componentAttrs, inspections,
 *     componentSpaceIds?:Map<string,Set<string>> }
 * @returns {Array} filtered components
 */
export function filterComponents(components, criteria, ctx) {
  const {
    floorPreset, residentialFloorIds, basementFloorIds, filterFloorIds,
    filterSystemIds, filterTypeCodes, filterStatuses, searchQuery = '',
    fixedAttrFilters = [], conditionAttrFilters = [], spaceFilterIds = null,
  } = criteria;
  const { types, attrDefs, componentAttrs, inspections, componentSpaceIds } = ctx;

  let list = components;

  // Floor
  if (floorPreset === 'residential') {
    list = list.filter(c => residentialFloorIds.has(c.floor_id));
  } else if (floorPreset === 'basement') {
    list = list.filter(c => basementFloorIds.has(c.floor_id));
  } else if (floorPreset === 'custom' && filterFloorIds.size > 0) {
    list = list.filter(c => filterFloorIds.has(c.floor_id));
  }

  // Space — the caller resolves the Space/Type/Kind controls into a set of
  // target space ids (null = inactive). A component matches if it belongs to
  // any target space (membership map supplied in ctx).
  if (spaceFilterIds) {
    const map = componentSpaceIds ?? new Map();
    list = list.filter(c => {
      const ids = map.get(c.id);
      if (!ids) return false;
      for (const id of ids) if (spaceFilterIds.has(id)) return true;
      return false;
    });
  }

  // System (via type's building_system_id)
  if (filterSystemIds.size > 0) {
    const systemTypeCodes = new Set(
      types.filter(t => filterSystemIds.has(t.building_system_id)).map(t => t.code)
    );
    list = list.filter(c => systemTypeCodes.has(c.type_code));
  }

  // Type
  if (filterTypeCodes.size > 0) list = list.filter(c => filterTypeCodes.has(c.type_code));

  // Status (stored values are lowercase; default 'ok')
  if (filterStatuses.size > 0) list = list.filter(c => filterStatuses.has((c.status || 'ok').toLowerCase()));

  // Search (asset_id, label, linked_component_ref)
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(c =>
      (c.asset_id ?? '').toLowerCase().includes(q) ||
      (c.label ?? '').toLowerCase().includes(q) ||
      (c.linked_component_ref ?? '').toLowerCase().includes(q)
    );
  }

  // Attribute filters — fixed (componentAttrs) + condition (inspections).
  // AND across filters; OR within a single 'in' filter's value list.
  if (fixedAttrFilters.length > 0 || conditionAttrFilters.length > 0) {
    const allFilters = [...fixedAttrFilters, ...conditionAttrFilters];
    list = list.filter(c => {
      const type = types.find(t => t.code === c.type_code);
      const defs = type ? (attrDefs[type.id] ?? []) : [];
      return matchesAllAttrFilters(c, defs, componentAttrs, inspections, allFilters);
    });
  }

  return list;
}

/**
 * Human-readable description of the active filters (report header / UI).
 * @param {object} criteria { floorPreset, filterFloorIds, filterSystemIds,
 *   filterTypeCodes, filterStatuses, searchQuery } (Sets where noted)
 * @param {object} refData  { floors, systems, types }
 */
export function describeComponentFilters(criteria, refData) {
  const { floorPreset, filterFloorIds, filterSystemIds, filterTypeCodes, filterStatuses, searchQuery = '' } = criteria;
  const { floors, systems, types } = refData;
  const parts = [];
  if (floorPreset === 'residential') parts.push('Floors: Residential');
  else if (floorPreset === 'basement') parts.push('Floors: Basement');
  else if (floorPreset === 'custom' && filterFloorIds.size > 0) {
    const names = floors.filter(f => filterFloorIds.has(f.id)).map(f => f.short_name).join(', ');
    parts.push(`Floors: ${names}`);
  }
  if (filterSystemIds.size > 0) {
    const names = systems.filter(s => filterSystemIds.has(s.id)).map(s => s.name).join(', ');
    parts.push(`Systems: ${names}`);
  }
  if (filterTypeCodes.size > 0) {
    const names = types.filter(t => filterTypeCodes.has(t.code)).map(t => t.name).join(', ');
    parts.push(`Types: ${names}`);
  }
  if (filterStatuses.size > 0 && filterStatuses.size < 4) {
    parts.push(`Status: ${[...filterStatuses].join(', ')}`);
  }
  if (searchQuery.trim()) parts.push(`Search: "${searchQuery.trim()}"`);
  return parts.join(' · ') || 'All components';
}
