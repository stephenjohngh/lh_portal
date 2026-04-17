// src/lib/apps/building_assets/componentPresets.js
// Preset configuration for the Components tab (and future Reports tab).
//
// A preset captures:
//   filters — floor scope, system, type, status, search (shared with report scope)
//   columns — table column visibility (table-specific display)
//
// Built-in presets are hardcoded constants.
// User presets are persisted to localStorage under STORAGE_KEY.
//
// Future extension: add a `report` section to capture the report content toggles
// (includePlan, includeList, etc.) so a single preset drives both the table view
// and the report generator.

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
// These are always visible and cannot be deleted.
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

// ── localStorage helpers ──────────────────────────────────────────────────────
const STORAGE_KEY = 'lh_portal_ba_presets';

/** Load user-saved presets from localStorage. Returns [] if none or parse error. */
export function loadUserPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Persist user presets array to localStorage. */
export function saveUserPresets(presets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch { /* quota exceeded or private browsing — silently ignore */ }
}

/** Generate a stable unique ID for a new user preset. */
export function makePresetId() {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Config equality ───────────────────────────────────────────────────────────
// Returns true when a preset's filters+columns match the supplied live config.
// Ignores filterFloorId — that's only meaningful when floorPreset === 'single',
// and 'single' is not used by any built-in preset.
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
