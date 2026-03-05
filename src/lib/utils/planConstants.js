// src/lib/utils/planConstants.js
// Constants for Plans app - element types, subtypes, colors, and configurations

export const ELEMENT_TYPE_OPTIONS = [
  { value: 'communal_door',  label: 'Communal Door',  icon: '🚪', color: '#c2410c', description: 'Entrance, fire, emergency and interior communal doors' },
  { value: 'apartment_door', label: 'Apartment Door', icon: '🚪', color: '#a855f7', description: 'Apartment fire doors' },
  { value: 'light',          label: 'Light',          icon: '💡', color: '#eab308', description: 'Bulkheads, battens, exit signs, downlights, pendants' },
  { value: 'fire_control',   label: 'Fire Control',   icon: '■',  color: '#ef4444', description: 'Sensors, call points, panels, sprinklers' },
  { value: 'other',          label: 'Other',          icon: '⚙️', color: '#06b6d4', description: 'Tanks, pumps, fans, cameras, aerials' }
];

export const ELEMENT_STATUS_OPTIONS = [
  { value: 'active',   label: 'OK',       color: '#22c55e' },
  { value: 'failed',   label: 'Failed',   color: '#ef4444' },
  { value: 'inactive', label: 'Inactive', color: '#64748b' }
];

// ============================================
// FLOOR LEVELS
// ============================================
// Ordered: L (Lower), U (Upper), G (Ground), 1–7
// Stored as text in the database (floor_level text column)

export const FLOOR_LEVELS = [
  { value: 'L', label: 'L — Lower' },
  { value: 'U', label: 'U — Upper' },
  { value: 'G', label: 'G — Ground' },
  { value: '1', label: '1 — First' },
  { value: '2', label: '2 — Second' },
  { value: '3', label: '3 — Third' },
  { value: '4', label: '4 — Fourth' },
  { value: '5', label: '5 — Fifth' },
  { value: '6', label: '6 — Sixth' },
  { value: '7', label: '7 — Seventh' }
];

// Default floor level for new plans
export const DEFAULT_FLOOR_LEVEL = 'G';

// Subtype options per element type
// UPDATED: Added Panel and Sprinkler to fire_control, added Other type with subtypes, added Exit CFL to lights
export const ELEMENT_SUBTYPES = {
  communal_door:  ['Entrance', 'Fire Door', 'Emergency Exit', 'Gate', 'Interior'],
  apartment_door: ['Fire Door'],
  light:          ['Bulkhead', 'Bulkhead CFL', 'Batten', 'Batten CFL', 'Exit', 'Exit CFL', 'Downlight', 'Pendant', 'Floodlight'],
  fire_control:   ['Sensor', 'Call Point', 'AC Call Point', 'Sounder', 'Hopper', 'Dry Riser', 'Panel', 'Sprinkler'],
  other:          ['Tank', 'Pump', 'Fan', 'Battery', 'Vent', 'Misc', 'Camera', 'Aerial']
};

// Battery options — for Light elements
export const BATTERY_OPTIONS = [
  { value: 'central', label: 'Central Battery' },
  { value: 'local',   label: 'Local Battery' },
  { value: 'none',    label: 'None' }
];

// Security options — for Door elements
export const SECURITY_OPTIONS = [
  { value: 'electronic', label: 'Electronic' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'none',       label: 'None' }
];

// SVG marker configuration
export const MARKER_RADIUS       = 12;
export const MARKER_HOVER_RADIUS = 16;
export const MARKER_STROKE_WIDTH = 2;

// Image constraints
export const MAX_IMAGE_SIZE      = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];

// Helper functions
export function getElementTypeConfig(type) {
  return ELEMENT_TYPE_OPTIONS.find(t => t.value === type);
}

export function getElementStatusConfig(status) {
  return ELEMENT_STATUS_OPTIONS.find(s => s.value === status);
}

export function getSubtypesForType(type) {
  return ELEMENT_SUBTYPES[type] || [];
}


/**
 * Get the display label for a floor level value.
 * e.g. 'G' → 'G — Ground',  '1' → '1 — First'
 */
export function getFloorLevelLabel(value) {
  return FLOOR_LEVELS.find(f => f.value === value)?.label ?? value ?? '?';
}

// ============================================
// ATTRIBUTE HELPERS
// ============================================

/**
 * Returns zeroed-out values for all type-specific attribute fields.
 * Call this in handleTypeChange() to prevent stale data persisting
 * when the user switches element type in the modal.
 */
export function blankAttributes() {
  return {
    emergency:       false,
    battery:         'none',
    movement_sensor: false,
    light_sensor:    false,
    wattage:         null,
    security:        'none',
    retained:        false
  };
}

/**
 * Returns a compact human-readable summary of an element's type-specific attributes.
 * Used in the PlanViewer element table Attributes column.
 */
export function getAttributeSummary(element) {
  if (element.element_type === 'light') {
    const parts = [];
    if (element.battery === 'central') parts.push('Central Batt.');
    if (element.battery === 'local')   parts.push('Local Batt.');
    if (element.battery === 'none')    parts.push('No Battery');
    if (element.wattage)               parts.push(`${element.wattage}W`);
    if (element.emergency)             parts.push('⚠ Emerg');
    if (element.movement_sensor)       parts.push('👁 Motion');
    if (element.light_sensor)          parts.push('☀ Light Snsr');
    return parts.length ? parts.join(' · ') : '—';
  }
  if (element.element_type === 'communal_door' || element.element_type === 'apartment_door') {
    const parts = [];
    if (element.security === 'electronic') parts.push('Electronic');
    if (element.security === 'mechanical') parts.push('Mechanical');
    if (element.retained)                  parts.push('Retained');
    return parts.length ? parts.join(' · ') : '—';
  }
  // fire_control and other have no structured attributes
  return '—';
}

// ============================================
// DERIVED NAME HELPERS
// ============================================

// Initial letter per element type used in derived name
const TYPE_INITIALS = {
  communal_door:  'D',
  apartment_door: 'A',
  light:          'L',
  fire_control:   'F',
  other:          'O'
};

/**
 * Derive the display name for an element.
 * Format: FloorCode/TypeInitial/AssetID
 * e.g. "G/L/001"  "3/D/042"  "G/F/007"  "G/O/015"
 */
export function getElementDisplayName(element, floorLevel) {
  const floor = floorLevel !== null && floorLevel !== undefined ? String(floorLevel) : '?';
  const type  = TYPE_INITIALS[element.element_type] ?? '?';
  const id    = element.asset_id ? element.asset_id : 'No ID';
  return `${floor}/${type}/${id}`;
}

/**
 * Get a short description for tooltips and table display.
 */
export function getElementDescription(element) {
  return element.label || element.subtype || element.element_type;
}
