// src/lib/apps/plans/utils/reportHelpers.js
// Shared helpers used by both server-side report generators.
// Kept in lib (not routes) so both +server.js files can import it.

// ── Type initials — must stay in sync with planConstants.js ───────────────
export const TYPE_INITIALS = {
  communal_door:  'D',
  apartment_door: 'A',
  light:          'L',
  fire_control:   'F'
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
  return { active: 'OK', failed: 'Failed', inactive: 'Inactive',
           maintenance: 'Maintenance', removed: 'Removed' }[s] ?? s ?? '—';
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
