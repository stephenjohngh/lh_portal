// src/lib/apps/building_assets/componentPresets.js
// Named filter/column/report configurations for the Components tab.
//
// sort_order IS NOT NULL  →  "standard report" preset, created by an admin,
//                            visible to all users, shown first (sorted by value).
// sort_order IS NULL      →  personal preset, visible only to owner,
//                            shown second (sorted alphabetically by name).
//
// Config JSONB shape: { filters, columns, report } — presetToState below is
// the one reading of it, old shapes included.

import { api } from '#lib/utils/api.js';

// -- DB helpers ----------------------------------------------------------------

function rowToPreset(row) {
  return {
    id:          row.id,
    name:        row.name,
    description: row.config?.description ?? '',
    sort_order:  row.sort_order ?? null,
    filters:     row.config?.filters ?? {},
    columns:     row.config?.columns ?? {},
    report:      row.config?.report  ?? {},
  };
}

/** Load all presets visible to the current user (RLS enforced).
 *  Returns unsorted — caller should split by sort_order and sort each group. */
export async function loadPresets() {
  const rows = await api.get('component_presets', {
    orderBy: 'created_at', ascending: true,
  });
  return rows.map(rowToPreset);
}

/** Save a new named preset.
 *  sortOrder:   integer or null (null = personal; integer = shared standard report).
 *  description: optional free text shown as a tooltip on the preset chip.
 *               Stored inside the config JSONB (no dedicated DB column). */
export async function createPreset(name, filters, columns, report, userId, sortOrder = null, description = '') {
  const row = await api.create('component_presets', {
    name,
    config:     { filters, columns, report, description: description?.trim() || '' },
    sort_order: sortOrder,
    created_by: userId,
  });
  return rowToPreset(row);
}

/** Delete a preset by ID. RLS allows admins to delete any preset. */
export async function removePreset(id) {
  await api.delete('component_presets', id);
}

// -- What a preset means, ONE rule -----------------------------------------------
//
// A saved preset may be in any shape the tab has ever written: single values
// before multi-select, a 'single' floor preset, no space or attribute filters,
// no report options. presetToState reads them all into today's shape, and BOTH
// applying a preset and highlighting the active one use it (2026-10-03).
// ⛔ They used to be two copies. The highlight's copy predated the space and
// attribute filters and the attribute/condition/space columns, so a preset
// with any of those showed as ACTIVE while none of them was applied.

const asArray = (list, single) => (Array.isArray(list) ? list : single ? [single] : []);

/**
 * A preset's config in today's shape, every field present.
 * @param {{ filters?: any, columns?: any, report?: any } | null | undefined} preset
 */
export function presetToState(preset) {
  const f = preset?.filters ?? {};
  const c = preset?.columns ?? {};
  const r = preset?.report  ?? {};
  const filterFloorIds = asArray(f.filterFloorIds, f.filterFloorId);
  return {
    filters: {
      // A legacy 'single' preset named one floor; today that is a custom set.
      floorPreset: f.floorPreset === 'single'
        ? (filterFloorIds.length > 0 ? 'custom' : 'all')
        : (f.floorPreset ?? 'all'),
      filterFloorIds,
      filterSystemIds: asArray(f.filterSystemIds, f.filterSystemId),
      filterTypeCodes: asArray(f.filterTypeCodes, f.filterTypeCode),
      filterStatuses:  asArray(f.filterStatuses,  f.filterStatus),
      // Saved before space filtering existed → none.
      filterSpaceIds:  asArray(f.filterSpaceIds),
      filterTypes:     asArray(f.filterTypes),
      filterKinds:     asArray(f.filterKinds),
      searchQuery:     f.searchQuery ?? '',
      // Saved before attribute filtering existed → none.
      fixedAttrFilters:     Array.isArray(f.fixedAttrFilters)     ? f.fixedAttrFilters     : [],
      conditionAttrFilters: Array.isArray(f.conditionAttrFilters) ? f.conditionAttrFilters : [],
    },
    columns: {
      showNotes:           c.showNotes,
      showLinked:          c.showLinked,
      showInspectionNotes: c.showInspectionNotes,
      // Saved before these toggles existed → shown, as they always were then.
      showAttributes:      c.showAttributes ?? true,
      showConditions:      c.showConditions ?? true,
      showSpaces:          c.showSpaces ?? false,
      view:                c.view ?? 'list',
    },
    // Saved before the report was tracked → the report's defaults.
    report: {
      includePlan:              r.includePlan              ?? false,
      includeList:              r.includeList              ?? true,
      includeFloorSummary:      r.includeFloorSummary      ?? true,
      includeFullSummary:       r.includeFullSummary       ?? false,
      includeFullComponentList: r.includeFullComponentList ?? false,
      planShowId:               r.planShowId               ?? true,
      planShowLabel:            r.planShowLabel            ?? false,
    },
  };
}

const SET_FIELDS = new Set(['filterFloorIds', 'filterSystemIds', 'filterTypeCodes', 'filterStatuses',
                            'filterSpaceIds', 'filterTypes', 'filterKinds']);

function sameValue(key, a, b) {
  if (SET_FIELDS.has(key)) {
    const sa = new Set(a), sb = new Set(b);
    return sa.size === sb.size && [...sa].every(x => sb.has(x));
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Is this preset what the tab is showing? Both sides go through presetToState,
 * so a field the tab can apply is a field this compares.
 */
export function configMatches(preset, config) {
  if (!config) return false;
  const p = presetToState(preset);
  const c = presetToState(config);
  return ['filters', 'columns', 'report'].every(part =>
    Object.keys(p[part]).every(key => sameValue(key, p[part][key], c[part][key])));
}
