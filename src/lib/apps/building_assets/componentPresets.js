// src/lib/apps/building_assets/componentPresets.js
// Named filter/column configurations for the Components tab.
//
// A preset captures:
//   filters — floor scope, system, type, status, search
//   columns — table column visibility
//
// Built-in presets are hardcoded constants (no DB row).
// User presets are persisted to the component_presets table (migration 034).
// RLS ensures each user only sees their own presets.
//
// Future extension: add a `report` section to capture V2ReportsTab content
// toggles (includePlan, includeList, etc.) so a single preset drives both
// the table view and the report generator.

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

// ── Built-in presets ──────────────────────────────────────────────────────────
// Always visible, cannot be deleted, no DB row.
export const BUILTIN_PRESETS = [
  {
    id:      'builtin_all',
    name:    'All',
    filters: { ...DEFAULT_CONFIG.filters },
    columns: { ...DEFAULT_CONFIG.columns },
  },
  {
    id:      'builtin_residential',
    name:    'Residential',
    filters: { ...DEFAULT_CONFIG.filters, floorPreset: 'residential' },
    columns: { ...DEFAULT_CONFIG.columns },
  },
  {
    id:      'builtin_basement',
    name:    'Basement',
    filters: { ...DEFAULT_CONFIG.filters, floorPreset: 'basement' },
    columns: { ...DEFAULT_CONFIG.columns },
  },
  {
    id:      'builtin_failed',
    name:    'Failed',
    filters: { ...DEFAULT_CONFIG.filters, filterStatus: 'failed' },
    columns: { ...DEFAULT_CONFIG.columns, showInspectionNotes: true },
  },
  {
    id:      'builtin_problem',
    name:    'Problems',
    filters: { ...DEFAULT_CONFIG.filters, filterStatus: 'problem' },
    columns: { ...DEFAULT_CONFIG.columns, showInspectionNotes: true },
  },
];

// ── DB helpers ────────────────────────────────────────────────────────────────

// Flatten a DB row into the flat preset shape used by the UI.
function rowToPreset(row) {
  return {
    id:      row.id,
    name:    row.name,
    filters: row.config?.filters ?? {},
    columns: row.config?.columns ?? {},
  };
}

/** Load all presets for the current user (RLS enforced). */
export async function loadPresets() {
  const rows = await api.get('component_presets', {
    orderBy: 'created_at', ascending: true,
  });
  return rows.map(rowToPreset);
}

/** Save a new named preset to the DB. Returns the created preset. */
export async function createPreset(name, filters, columns, userId) {
  const row = await api.create('component_presets', {
    name,
    config:     { filters, columns },
    created_by: userId,
  });
  return rowToPreset(row);
}

/** Delete a user preset by ID. */
export async function removePreset(id) {
  await api.delete('component_presets', id);
}

// ── Config equality ───────────────────────────────────────────────────────────
// Returns true when a preset's filters + columns match the supplied live config.
// Ignores filterFloorId — only meaningful when floorPreset === 'single', which
// no built-in preset uses.
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
