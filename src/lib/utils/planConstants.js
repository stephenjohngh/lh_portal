// src/lib/utils/planConstants.js
// Constants for Plans app - element types, subtypes, colors, and configurations

export const ELEMENT_TYPES = {
  DOOR:         'door',
  LIGHT:        'light',
  FIRE_CONTROL: 'fire_control'
};

export const ELEMENT_TYPE_OPTIONS = [
  { value: 'door',         label: 'Door',         icon: '🚪', color: '#f97316', description: 'Entrance, fire, emergency and interior doors' },
  { value: 'light',        label: 'Light',        icon: '💡', color: '#eab308', description: 'Bulkheads, battens, exit signs, downlights, pendants' },
  { value: 'fire_control', label: 'Fire Control', icon: '🔴', color: '#ef4444', description: 'Sensors and call points' }
];

export const ELEMENT_STATUS = {
  ACTIVE:   'active',
  FAILED:   'failed',
  INACTIVE: 'inactive'
};

export const ELEMENT_STATUS_OPTIONS = [
  { value: 'active',   label: 'Active',   color: '#22c55e' },
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
export const ELEMENT_SUBTYPES = {
  light:        ['Bulkhead', 'Batten', 'Exit', 'Downlight', 'Pendant'],
  door:         ['Entrance', 'Fire Door', 'Double Fire Door', 'Emergency Exit', 'Gate', 'Apartment', 'Interior'],
  fire_control: ['Sensor', 'Call Point']
};

// Battery options — for Light elements
export const BATTERY_OPTIONS = [
  { value: 'central', label: 'Central Battery' },
  { value: 'local',   label: 'Local Battery' },
  { value: 'none',    label: 'None (Mains)' }
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

export function isValidElementType(type) {
  return Object.values(ELEMENT_TYPES).includes(type);
}

export function isValidElementStatus(status) {
  return Object.values(ELEMENT_STATUS).includes(status);
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
    battery:         null,
    movement_sensor: false,
    light_sensor:    false,
    wattage:         null,
    security:        null,
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
    if (element.battery === 'none')    parts.push('Mains');
    if (element.wattage)               parts.push(`${element.wattage}W`);
    if (element.emergency)             parts.push('⚠ Emerg');
    if (element.movement_sensor)       parts.push('👁 Motion');
    if (element.light_sensor)          parts.push('☀ Light Snsr');
    return parts.length ? parts.join(' · ') : '—';
  }
  if (element.element_type === 'door') {
    const parts = [];
    if (element.security === 'electronic') parts.push('Electronic');
    if (element.security === 'mechanical') parts.push('Mechanical');
    if (element.retained)                  parts.push('Retained');
    return parts.length ? parts.join(' · ') : '—';
  }
  return '—'; // fire_control has no structured attributes
}

// ============================================
// DERIVED NAME HELPERS
// ============================================

// Initial letter per element type used in derived name
const TYPE_INITIALS = {
  light:        'L',
  door:         'D',
  fire_control: 'F'
};

/**
 * Derive the display name for an element.
 * Format: FloorCode/TypeInitial/AssetID
 * e.g. "G/L/001"  "3/D/042"  "G/F/007"
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
