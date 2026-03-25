// src/lib/apps/plans/utils/reportHelpers.js
// Shared helpers used by both server-side report generators.
// Kept in lib (not routes) so both +server.js files can import it.

import { TYPE_INITIALS, ELEMENT_SUBTYPES, getElementDisplayName } from '$lib/utils/planConstants';

// Re-export so server routes import from one place instead of maintaining their own copies
export { TYPE_INITIALS, ELEMENT_SUBTYPES };

// ── Derived element ID: FloorCode/TypeInitial/AssetID e.g. "G/D/001" ──────
// Thin wrapper over planConstants.getElementDisplayName — kept for back-compat
// with generate-report/+server.js which imports this name.
export function elementDisplayId(element, floorLevel) {
  return getElementDisplayName(element, floorLevel);
}

// ── Status display label ───────────────────────────────────────────────────
export function statusLabel(s) {
  return {
    active:      'OK',
    failed:      'Failed',
    inactive:    'Inactive',
    maintenance: 'Maintenance',
    removed:     'Removed'
  }[s] ?? s ?? '—';
}

// ── Truncate to max chars (used by building report for column widths) ──────
export function trunc(val, maxLen) {
  if (!val) return '—';
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

// ── Sort by asset_id, numeric-aware ────────────────────────────────────────
export function sortByAssetId(a, b) {
  return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
}

// ── Validate and normalize subtype ────────────────────────────────────────
// Returns the subtype name as-is (kept for display); data may predate current subtype lists.
export function normalizeSubtype(element) {
  if (!element.subtype) return 'Unspecified';
  return element.subtype;
}

// ── Subtype count summary e.g. "Fire Door: 4  ·  Entrance: 2" ─────────────
export function subtypeSummary(elements) {
  const counts = {};
  for (const el of elements) {
    const k = normalizeSubtype(el);
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([sub, n]) => `${sub}: ${n}`)
    .join('  ·  ');
}

// ── Get human-readable type label ──────────────────────────────────────────
// Single source of truth for type → label used by server report routes.
// Fallback converts snake_case to Title Case for unknown future types.
export function typeLabel(elementType) {
  const labels = {
    communal_door:  'Communal Door',
    apartment_door: 'Apartment Door',
    light:          'Light',
    fire_control:   'Fire Control',
    other:          'Other'
  };
  return labels[elementType] ?? elementType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
