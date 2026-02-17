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
    color: '#f97316',      // Orange
    description: 'Entry points, fire doors, emergency exits'
  },
  { 
    value: 'light', 
    label: 'Light', 
    icon: '💡', 
    color: '#eab308',      // Yellow
    description: 'Lighting fixtures, emergency lights, exit signs'
  },
  { 
    value: 'sensor', 
    label: 'Sensor', 
    icon: '📡', 
    color: '#3b82f6',      // Blue
    description: 'Motion sensors, smoke detectors, cameras'
  },
  { 
    value: 'outlet', 
    label: 'Outlet', 
    icon: '🔌', 
    color: '#22c55e',      // Green
    description: 'Power outlets, data ports, connections'
  },
  { 
    value: 'other', 
    label: 'Other', 
    icon: '📍', 
    color: '#a855f7',      // Purple
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
  { value: 'active', label: 'Active', color: '#22c55e' },
  { value: 'inactive', label: 'Inactive', color: '#64748b' },
  { value: 'maintenance', label: 'Maintenance', color: '#f59e0b' },
  { value: 'removed', label: 'Removed', color: '#ef4444' }
];

// Subtype options per element type
export const ELEMENT_SUBTYPES = {
  door: [
    'Entry Door',
    'Fire Door',
    'Emergency Exit',
    'Interior Door',
    'Sliding Door',
    'Revolving Door',
    'Double Door',
    'Security Door'
  ],
  light: [
    'LED Downlight',
    'Fluorescent',
    'Track Light',
    'Pendant Light',
    'Wall Sconce',
    'Emergency Light',
    'Exit Sign',
    'Spotlight'
  ],
  sensor: [
    'Motion Sensor',
    'Smoke Detector',
    'CO Detector',
    'Temperature Sensor',
    'Humidity Sensor',
    'Security Camera',
    'Access Control',
    'Door Contact'
  ],
  outlet: [
    'Standard Outlet',
    'USB Outlet',
    'GFCI Outlet',
    'Floor Outlet',
    '220V Outlet',
    'Data Port',
    'Phone Jack',
    'Coax Port'
  ],
  other: [
    'Junction Box',
    'Breaker Panel',
    'Thermostat',
    'Sprinkler Head',
    'Vent',
    'Access Panel',
    'Other'
  ]
};

// SVG marker configuration
export const MARKER_RADIUS = 12;
export const MARKER_HOVER_RADIUS = 16;
export const MARKER_STROKE_WIDTH = 2;

// Image constraints
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];

// Helper function to get element type config
export function getElementTypeConfig(type) {
  return ELEMENT_TYPE_OPTIONS.find(t => t.value === type);
}

// Helper function to get element status config
export function getElementStatusConfig(status) {
  return ELEMENT_STATUS_OPTIONS.find(s => s.value === status);
}

// Helper function to get subtypes for element type
export function getSubtypesForType(type) {
  return ELEMENT_SUBTYPES[type] || [];
}

// Validate element type
export function isValidElementType(type) {
  return Object.values(ELEMENT_TYPES).includes(type);
}

// Validate element status
export function isValidElementStatus(status) {
  return Object.values(ELEMENT_STATUS).includes(status);
}

// ============================================
// DERIVED NAME HELPERS
// ============================================

/**
 * Derive the display name for an element.
 * Format: "Floor Level / Asset ID"
 * e.g. "0 / DR-001"  or  "2 / LT-005"
 * Falls back gracefully when either part is missing.
 *
 * @param {object} element  - plan_elements row
 * @param {number|string} floorLevel - from parent plan.floor_level
 * @returns {string}
 */
export function getElementDisplayName(element, floorLevel) {
  const floor = floorLevel !== null && floorLevel !== undefined ? String(floorLevel) : '?';
  const id    = element.asset_id ? element.asset_id : 'No ID';
  return `${floor} / ${id}`;
}

/**
 * Get a short description for tooltips and table display.
 * Shows label if set, otherwise falls back to subtype, then type.
 *
 * @param {object} element
 * @returns {string}
 */
export function getElementDescription(element) {
  return element.label || element.subtype || element.element_type;
}
