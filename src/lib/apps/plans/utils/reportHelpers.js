// src/lib/apps/plans/utils/reportHelpers.js
// Shared helpers used by both server-side report generators.
// Kept in lib (not routes) so both +server.js files can import it.

// ── Type initials — must stay in sync with planConstants.js ───────────────
// These match the TYPE_INITIALS used in getElementDisplayName()
export const TYPE_INITIALS = {
  communal_door:  'D',
  apartment_door: 'A',
  light:          'L',
  fire_control:   'F',
  other:          'O'  // For any other/unknown element types
};

// ── Valid subtypes per element type (from planConstants.js) ───────────────
export const ELEMENT_SUBTYPES = {
  communal_door:  ['Entrance', 'Fire Door', 'Emergency Exit', 'Gate', 'Interior'],
  apartment_door: ['Fire Door'],
  light:          ['Bulkhead', 'Bulkhead CFL', 'Batten', 'Batten CFL', 'Exit', 'Downlight', 'Pendant'],
  fire_control:   ['Sensor', 'Call Point', 'AC Call Point', 'Sounder', 'Vent', 'Dry Riser']
};

// ── Derived element ID: FloorCode/TypeInitial/AssetID e.g. "G/D/001" ──────
export function elementDisplayId(element, floorLevel) {
  const floor = floorLevel !== null && floorLevel !== undefined ? String(floorLevel) : '?';
  const type  = TYPE_INITIALS[element.element_type] ?? 'O';  // Default to 'O' for unknown
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
// Returns the subtype if valid for the element type, otherwise 'Unspecified'
export function normalizeSubtype(element) {
  if (!element.subtype) return 'Unspecified';
  
  const validSubtypes = ELEMENT_SUBTYPES[element.element_type];
  if (!validSubtypes) return element.subtype;  // Unknown type, keep as-is
  
  // Check if the subtype is valid for this element type
  if (validSubtypes.includes(element.subtype)) {
    return element.subtype;
  }
  
  // Subtype exists but is not in the valid list for this type
  return element.subtype;  // Keep it but note it's potentially invalid
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
