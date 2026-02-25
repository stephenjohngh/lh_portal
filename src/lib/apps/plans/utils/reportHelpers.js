// $lib/apps/plans/utils/reportHelpers.js
// Helper functions for floor plan report generation

/**
 * Generate display ID for an element
 * Format: floor/type/number
 * Example: "g/L/001" (ground floor, light, number 001)
 *          "l/O/042" (lower basement, others, number 042)
 * 
 * @param {Object} element - Element object with element_type and asset_id
 * @param {string} floorLevel - Floor level code (U, L, G, 1, 2, etc.)
 * @returns {string} Formatted element ID
 */
export function elementDisplayId(element, floorLevel) {
  // Type code mapping
  // L = Light
  // C = Communal Door
  // A = Apartment Door
  // O = Others (Fire Control and any future types)
  const typeMap = {
    light: 'L',
    communal_door: 'C',
    apartment_door: 'A',
    fire_control: 'O'  // FIXED: Was '?', now 'O' for "Others"
  };
  
  // Get type code, default to 'O' for unknown types
  const type = typeMap[element.element_type] || 'O';
  
  // Convert floor level to lowercase for consistency
  // Handle null/undefined floor levels
  const floor = floorLevel ? String(floorLevel).toLowerCase() : '?';
  
  // Pad asset_id to 3 digits (e.g., "5" → "005")
  const num = String(element.asset_id || '000').padStart(3, '0');
  
  // Return formatted ID: "floor/type/number"
  // Examples:
  //   - Light on Ground floor: "g/L/001"
  //   - Fire Control on Lower basement: "l/O/042"
  //   - Communal Door on Floor 1: "1/C/015"
  return `${floor}/${type}/${num}`;
}

/**
 * Get human-readable status label
 * @param {string} status - Status code ('ok', 'failed', 'inactive')
 * @returns {string} Display label
 */
export function statusLabel(status) {
  const labels = {
    ok: 'OK',
    failed: 'Failed',
    inactive: 'Inactive'
  };
  return labels[status] || status;
}

/**
 * Sort elements by asset_id (numeric sort)
 * @param {Object[]} elements - Array of elements
 * @returns {Object[]} Sorted array
 */
export function sortByAssetId(elements) {
  return [...elements].sort((a, b) => {
    const aNum = parseInt(a.asset_id) || 0;
    const bNum = parseInt(b.asset_id) || 0;
    return aNum - bNum;
  });
}

/**
 * Format boolean value for display
 * @param {boolean} value - Boolean value
 * @returns {string} 'Yes' or 'No'
 */
export function formatBoolean(value) {
  return value ? 'Yes' : 'No';
}

/**
 * Get display name for element subtype
 * @param {string} elementType - Element type
 * @param {string} subtype - Subtype code
 * @returns {string} Display name
 */
export function subtypeDisplayName(elementType, subtype) {
  const subtypeMap = {
    light: {
      bulkhead: 'Bulkhead',
      emergency: 'Emergency',
      exit: 'Exit'
    },
    communal_door: {
      entrance: 'Entrance',
      exit: 'Exit',
      lobby: 'Lobby',
      stairwell: 'Stairwell'
    },
    apartment_door: {
      main: 'Main',
      service: 'Service',
      balcony: 'Balcony'
    },
    fire_control: {
      extinguisher: 'Extinguisher',
      alarm: 'Alarm',
      panel: 'Panel',
      hose: 'Hose'
    }
  };
  
  return subtypeMap[elementType]?.[subtype] || subtype;
}

/**
 * Get display name for battery status
 * @param {string} battery - Battery status code
 * @returns {string} Display name
 */
export function batteryDisplayName(battery) {
  const batteryMap = {
    yes: 'Yes',
    no: 'No',
    needs_attention: 'Needs Attention'
  };
  return batteryMap[battery] || battery;
}

/**
 * Get display name for security level
 * @param {string} security - Security level code
 * @returns {string} Display name
 */
export function securityDisplayName(security) {
  const securityMap = {
    standard: 'Standard',
    enhanced: 'Enhanced',
    keycard: 'Keycard'
  };
  return securityMap[security] || security;
}
