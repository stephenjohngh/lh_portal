// src/lib/apps/building_assets/componentPresets.js
// Named filter/column configurations for the Components tab.
//
// sort_order IS NOT NULL  →  "standard report" preset, created by an admin,
//                            visible to all users, shown first (sorted by value).
// sort_order IS NULL      →  personal preset, visible only to owner,
//                            shown second (sorted alphabetically by name).
//
// Future extension: add a `report` section to the config JSONB to capture
// V2ReportsTab content toggles (includePlan, includeList, etc.) so a single
// preset drives both the table view and the report generator.

import { api } from '$lib/utils/api';

// -- Default state -------------------------------------------------------------
// Mirrors the initial values in ComponentsTab.svelte.
export const DEFAULT_CONFIG = {
  filters: {
    floorPreset:     'all',
    filterFloorIds:  [],
    filterSystemIds: [],
    filterTypeCodes: [],
    filterStatuses:  [],
    searchQuery:     '',
  },
  columns: {
    showNotes:           true,
    showLinked:          true,
    showInspectionNotes: false,
    view:                'list',
  },
};

// -- DB helpers ----------------------------------------------------------------

function rowToPreset(row) {
  return {
    id:         row.id,
    name:       row.name,
    sort_order: row.sort_order ?? null,
    filters:    row.config?.filters ?? {},
    columns:    row.config?.columns ?? {},
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
 *  sortOrder: integer or null (null = personal; integer = shared standard report). */
export async function createPreset(name, filters, columns, userId, sortOrder = null) {
  const row = await api.create('component_presets', {
    name,
    config:     { filters, columns },
    sort_order: sortOrder,
    created_by: userId,
  });
  return rowToPreset(row);
}

/** Delete a preset by ID. RLS allows admins to delete any preset. */
export async function removePreset(id) {
  await api.delete('component_presets', id);
}

// -- Config equality -----------------------------------------------------------
// Returns true when a preset's filters + columns match the supplied live config.
// Handles both new (array) and legacy (single-string) filter formats for
// smooth backward compatibility with presets saved before multi-select.
export function configMatches(preset, config) {
  if (!config) return false;
  const pf = preset.filters;
  const pc = preset.columns;
  const { filters: cf, columns: cc } = config;

  // Normalise a value that may be an array (new) or a single string (legacy) to a Set.
  function toSet(v) {
    if (Array.isArray(v)) return new Set(v);
    return v ? new Set([v]) : new Set();
  }
  function sameSet(a, b) {
    const sa = toSet(a), sb = toSet(b);
    if (sa.size !== sb.size) return false;
    for (const x of sa) if (!sb.has(x)) return false;
    return true;
  }

  return (
    (pf.floorPreset  ?? 'all') === (cf.floorPreset  ?? 'all') &&
    (pf.searchQuery  ?? '')    === (cf.searchQuery   ?? '')    &&
    sameSet(pf.filterFloorIds  ?? (pf.filterFloorId  ? [pf.filterFloorId]  : []), cf.filterFloorIds  ?? []) &&
    sameSet(pf.filterSystemIds ?? (pf.filterSystemId ? [pf.filterSystemId] : []), cf.filterSystemIds ?? []) &&
    sameSet(pf.filterTypeCodes ?? (pf.filterTypeCode ? [pf.filterTypeCode] : []), cf.filterTypeCodes ?? []) &&
    sameSet(pf.filterStatuses  ?? (pf.filterStatus   ? [pf.filterStatus]   : []), cf.filterStatuses  ?? []) &&
    pc.showNotes           === cc.showNotes           &&
    pc.showLinked          === cc.showLinked          &&
    pc.showInspectionNotes === cc.showInspectionNotes &&
    (pc.view ?? 'list')    === (cc.view ?? 'list')
  );
}
