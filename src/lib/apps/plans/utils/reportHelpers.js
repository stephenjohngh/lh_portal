// src/lib/apps/plans/utils/reportHelpers.js
// Shared helpers used by server-side report generators.
// Kept in lib (not routes) so all +server.js files can import it.

// ── Type initials — must stay in sync with planConstants.js ───────────────
export const TYPE_INITIALS = {
  communal_door:  'D',
  apartment_door: 'A',
  light:          'L',
  fire_control:   'F',
};

// ── Derived element ID: FloorCode/TypeInitial/AssetID e.g. "G/D/001" ──────
export function elementDisplayId(element, floorLevel) {
  const floor = floorLevel !== null && floorLevel !== undefined ? String(floorLevel) : '?';
  const type  = TYPE_INITIALS[element.element_type] ?? '?';
  const id    = element.asset_id || 'No ID';
  return `${floor}/${type}/${id}`;
}

// ── Status display label ───────────────────────────────────────────────────
export function statusLabel(s) {
  return {
    active:      'OK',
    failed:      'Failed',
    inactive:    'Inactive',
    maintenance: 'Maintenance',
    removed:     'Removed',
  }[s] ?? s ?? '—';
}

// ── Truncate to max chars (used by building report for column widths) ──────
export function trunc(val, maxLen) {
  if (!val) return '—';
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

// ── Sort by asset_id, numeric-aware ───────────────────────────────────────
export function sortByAssetId(a, b) {
  return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
}

// ── Subtype count summary e.g. "Fire Door: 4  ·  Entrance: 2" ─────────────
export function subtypeSummary(elements) {
  const counts = {};
  for (const el of elements) {
    const k = el.subtype || 'Unspecified';
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([sub, n]) => `${sub}: ${n}`)
    .join('  ·  ');
}

// ── Floor level helpers ────────────────────────────────────────────────────
// Canonical sort order: L, U, G, 1–7
export const FLOOR_ORDER = {
  L: 0, U: 1, G: 2,
  '1': 3, '2': 4, '3': 5, '4': 6, '5': 7, '6': 8, '7': 9,
};

/** Numeric sort key for floor_level text values. Unknown levels sort last. */
export function floorSortKey(fl) {
  return FLOOR_ORDER[String(fl)] ?? 99;
}

/**
 * Human-readable floor level label.
 * "G" → "Floor G — Ground",  "1" → "Floor 1 — First"
 */
export function floorDisplayLabel(fl) {
  const names = {
    L: 'Lower', U: 'Upper', G: 'Ground',
    '1': 'First', '2': 'Second', '3': 'Third', '4': 'Fourth',
    '5': 'Fifth', '6': 'Sixth', '7': 'Seventh',
  };
  const v = String(fl ?? '');
  return names[v] ? `Floor ${v} — ${names[v]}` : `Floor ${v}`;
}
