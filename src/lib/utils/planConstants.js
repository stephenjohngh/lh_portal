// src/lib/utils/planConstants.js
// Constants for Plans app - element types, subtypes, colors, and configurations

export const ELEMENT_TYPES = {
  DOOR: 'door',
  LIGHT: 'light',
  SENSOR: 'sensor',
  OUTLET: 'outlet',
  OTHER: 'other'
};

export const ELEMENT_TYPE_OPTIONS = [
  { 
    value: 'door', 
    label: 'Door', 
    icon: '🚪', 
    color: '#f97316',
    description: 'Entry points, fire doors, emergency exits'
  },
  { 
    value: 'light', 
    label: 'Light', 
    icon: '💡', 
    color: '#eab308',
    description: 'Lighting fixtures, emergency lights, exit signs'
  },
  { 
    value: 'sensor', 
    label: 'Sensor', 
    icon: '📡', 
    color: '#3b82f6',
    description: 'Motion sensors, smoke detectors, cameras'
  },
  { 
    value: 'outlet', 
    label: 'Outlet', 
    icon: '🔌', 
    color: '#22c55e',
    description: 'Power outlets, data ports, connections'
  },
  { 
    value: 'other', 
    label: 'Other', 
    icon: '📍', 
    color: '#a855f7',
    description: 'Junction boxes, panels, other fixtures'
  }
];

export const ELEMENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  MAINTENANCE: 'maintenance',
  REMOVED: 'removed'
};

export const ELEMENT_STATUS_OPTIONS = [
  { value: 'active',      label: 'Active',      color: '#22c55e' },
  { value: 'inactive',    label: 'Inactive',    color: '#64748b' },
  { value: 'maintenance', label: 'Maintenance', color: '#f59e0b' },
  { value: 'removed',     label: 'Removed',     color: '#ef4444' }
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
  door: [
    'Entry Door', 'Fire Door', 'Emergency Exit', 'Interior Door',
    'Sliding Door', 'Revolving Door', 'Double Door', 'Security Door'
  ],
  light: [
    'LED Downlight', 'Fluorescent', 'Track Light', 'Pendant Light',
    'Wall Sconce', 'Emergency Light', 'Exit Sign', 'Spotlight'
  ],
  sensor: [
    'Motion Sensor', 'Smoke Detector', 'CO Detector', 'Temperature Sensor',
    'Humidity Sensor', 'Security Camera', 'Access Control', 'Door Contact'
  ],
  outlet: [
    'Standard Outlet', 'USB Outlet', 'GFCI Outlet', 'Floor Outlet',
    '220V Outlet', 'Data Port', 'Phone Jack', 'Coax Port'
  ],
  other: [
    'Junction Box', 'Breaker Panel', 'Thermostat', 'Sprinkler Head',
    'Vent', 'Access Panel', 'Other'
  ]
};

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
// DERIVED NAME HELPERS
// ============================================

/**
 * Derive the display name for an element.
 * Format: "Floor Level / Asset ID"
 * e.g. "G / DR-001"  or  "1 / LT-005"
 */
export function getElementDisplayName(element, floorLevel) {
  const floor = floorLevel !== null && floorLevel !== undefined ? String(floorLevel) : '?';
  const id    = element.asset_id ? element.asset_id : 'No ID';
  return `${floor} / ${id}`;
}

/**
 * Get a short description for tooltips and table display.
 */
export function getElementDescription(element) {
  return element.label || element.subtype || element.element_type;
}
