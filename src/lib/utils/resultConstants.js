// src/lib/utils/resultConstants.js
// Result and status constants for component inspections.
// Single source of truth for result labels, badge colours, ranking, and status config.
// Used by: inspection app, building assets app, and report generation.

// ⚠ RESULT (an inspection outcome) and STATUS (a component's condition) are
// DIFFERENT vocabularies and must not be merged. 'no_access' is a valid result —
// the inspector attended but could not assess — and is deliberately NOT a
// status: not observing a component tells you nothing about its condition, so
// its status keeps the last value anyone actually saw. Migration 167 enforces
// this in the DB (the two CHECK constraints diverge).

// -- Result display labels -----------------------------------------------------
export const RESULT_LABELS = {
  ok:        '✓ PASS',
  failed:    '✗ FAIL',
  problem:   '⚙ PROBLEM',
  inactive:  '— INACTIVE',
  no_access: '⊘ NO ACCESS',
};

// -- Tailwind badge background classes (standard app theme) --------------------
export const RESULT_BADGE_COLOURS = {
  ok:        'bg-green-600',
  failed:    'bg-red-600',
  problem:   'bg-orange-500',
  inactive:  'bg-slate-600',
  no_access: 'bg-purple-700',
};

// -- Sort rank: lower = more severe -------------------------------------------
// no_access sits above 'ok': a safety component nobody could assess needs
// attention before one that passed. Unknown values fall back to 5 (last).
export const RESULT_RANK = { failed: 0, problem: 1, no_access: 2, ok: 3, inactive: 4 };

// -- Why a component could not be assessed (no_access rows) -------------------
export const NO_ACCESS_REASONS = [
  { value: 'locked',     label: 'Locked / no key' },
  { value: 'refused',    label: 'Resident refused' },
  { value: 'obstructed', label: 'Obstructed' },
  { value: 'unsafe',     label: 'Unsafe to access' },
  { value: 'other',      label: 'Other' },
];

export function noAccessReasonLabel(value) {
  return NO_ACCESS_REASONS.find(r => r.value === value)?.label ?? value ?? '—';
}

// -- Helpers -------------------------------------------------------------------

export function resultLabel(result) {
  return RESULT_LABELS[result] ?? result;
}

export function resultRank(result) {
  return RESULT_RANK[result] ?? 5;
}

export function resultBadgeColor(result) {
  return RESULT_BADGE_COLOURS[result] ?? 'bg-slate-600';
}

// -- Status config array (for building assets UI: dots, rings, badges) --------
// Canonical list of all possible component statuses with Tailwind styling.
// Deliberately has NO 'no_access' entry — see the note at the top of this file.
export const STATUSES = [
  { value: 'ok',       label: 'OK',       dot: 'bg-green-400',  bg: 'bg-green-600',  ring: 'ring-green-500',  badge: 'bg-green-900/50 text-green-400',  dim: 'bg-green-900/30 text-green-700'  },
  { value: 'problem',  label: 'Problem',  dot: 'bg-amber-400',  bg: 'bg-yellow-600', ring: 'ring-yellow-500', badge: 'bg-amber-900/50 text-amber-400',  dim: 'bg-yellow-900/20 text-yellow-700' },
  { value: 'failed',   label: 'Failed',   dot: 'bg-red-400',    bg: 'bg-red-600',    ring: 'ring-red-500',    badge: 'bg-red-900/50 text-red-400',      dim: 'bg-red-900/20 text-red-700'     },
  { value: 'inactive', label: 'Inactive', dot: 'bg-slate-500',  bg: 'bg-slate-600',  ring: 'ring-slate-500',  badge: 'bg-slate-700 text-slate-500',     dim: 'bg-slate-700 text-slate-500'    },
];

// Look up a status config object by value
export function statusCfg(value) {
  return STATUSES.find(s => s.value === (value ?? 'ok')) ?? STATUSES[0];
}

// -- Convenience helpers for components ---------------------------------------

/** Badge background + text class for a status value (building assets theme). */
export function statusBadgeCls(value) {
  return statusCfg(value).badge;
}

/** Dot/circle fill class for a status value. */
export function statusDotCls(value) {
  return statusCfg(value).dot;
}

/** Text-only colour class for a status value. */
export function statusTextCls(value) {
  return statusCfg(value).dot.replace('bg-', 'text-');
}
