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

// ── Default state ─────────────────────────────────────────────────────────────
// Mirrors the initial values in ComponentsTab.svelte.
export const DEFAULT_CONFIG = {
  filters: {
    floorPreset:    'all',
    filterFloorId:  '',
    filterSystemId: '',
    filterTypeCode: '',
    filterStatus:   '',
    searchQuery:    '',
  },
  columns: {
    showNotes:           true,
    showLinked:          true,
    showInspectionNotes: false,
  },
};

// ── DB helpers ────────────────────────────────────────────────────────────────

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

// ── Config equality ───────────────────────────────────────────────────────────
// Returns true when a preset's filters + columns match the supplied live config.
// Ignores filterFloorId — only meaningful when floorPreset === 'single'.
export function configMatches(preset, config) {
  if (!config) return false;
  const pf = preset.filters;
  const pc = preset.columns;
  const { filters: cf, columns: cc } = config;
  return (
    pf.floorPreset    === cf.floorPreset    &&
    pf.filterSystemId === cf.filterSystemId &&
    pf.filterTypeCode === cf.filterTypeCode &&
    pf.filterStatus   === cf.filterStatus   &&
    pf.searchQuery    === cf.searchQuery    &&
    pc.showNotes           === cc.showNotes           &&
    pc.showLinked          === cc.showLinked          &&
    pc.showInspectionNotes === cc.showInspectionNotes
  );
}
