// src/lib/apps/plans/utils/elementFiltering.js
// Shared element filtering logic for Plans app

/**
 * Check if element matches filter criteria
 * @param {Object} element - Plan element
 * @param {Object} filters - Filter configuration
 * @returns {boolean} True if element passes all filters
 */
export function matchesFilters(element, filters) {
  if (!filters) return true;
  
  // Status filter
  if (filters.statuses?.length > 0) {
    if (!filters.statuses.includes(element.status)) {
      return false;
    }
  }
  
  // Element type filter
  if (filters.types?.length > 0) {
    if (!filters.types.includes(element.element_type)) {
      return false;
    }
  }
  
  // Light-specific filters
  if (element.element_type === 'light' && filters.lightFilters) {
    const lf = filters.lightFilters;
    
    // Emergency lights only
    if (lf.emergency && !element.emergency) {
      return false;
    }
    
    // Light subtypes
    if (lf.subtypes?.length > 0 && !lf.subtypes.includes(element.subtype)) {
      return false;
    }
    
    // Battery-powered only
    if (lf.batteryPowered && !element.battery_type) {
      return false;
    }
    
    // Movement sensor only
    if (lf.movementSensor && !element.movement_sensor) {
      return false;
    }
    
    // Light sensor only
    if (lf.lightSensor && !element.light_sensor) {
      return false;
    }
  }
  
  // Communal door filters
  if (element.element_type === 'communal_door' && filters.doorFilters) {
    const df = filters.doorFilters;
    
    // Retained doors only
    if (df.retained && !element.retained) {
      return false;
    }
    
    // Door subtypes
    if (df.subtypes?.length > 0 && !df.subtypes.includes(element.subtype)) {
      return false;
    }
  }
  
  // Apartment door filters
  if (element.element_type === 'apartment_door' && filters.doorFilters) {
    const df = filters.doorFilters;
    
    // Door subtypes
    if (df.subtypes?.length > 0 && !df.subtypes.includes(element.subtype)) {
      return false;
    }
  }
  
  // Fire control filters
  if (element.element_type === 'fire_control' && filters.fireFilters) {
    const ff = filters.fireFilters;
    
    // Fire control subtypes
    if (ff.subtypes?.length > 0 && !ff.subtypes.includes(element.subtype)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Apply filters to an array of elements
 * @param {Array} elements - Array of plan elements
 * @param {Object} filters - Filter configuration
 * @returns {Array} Filtered elements
 */
export function filterElements(elements, filters) {
  if (!filters || !elements) return elements || [];
  return elements.filter(el => matchesFilters(el, filters));
}

/**
 * Count elements matching filters (for UI badges)
 * @param {Array} elements - Array of plan elements
 * @param {Object} filters - Filter configuration
 * @returns {number} Count of matching elements
 */
export function countFilteredElements(elements, filters) {
  return filterElements(elements, filters).length;
}

/**
 * Group filtered elements by type
 * Returns object with counts per element type
 * @param {Array} elements - Array of plan elements
 * @param {Object} filters - Filter configuration
 * @returns {Object} { light: 5, communal_door: 3, ... }
 */
export function countByType(elements, filters) {
  const filtered = filterElements(elements, filters);
  const counts = {};
  
  for (const el of filtered) {
    counts[el.element_type] = (counts[el.element_type] || 0) + 1;
  }
  
  return counts;
}

/**
 * Check if any filters are active
 * @param {Object} filters - Filter configuration
 * @returns {boolean} True if any filters are set
 */
export function hasActiveFilters(filters) {
  if (!filters) return false;
  
  if (filters.statuses?.length > 0) return true;
  if (filters.types?.length > 0) return true;
  
  if (filters.lightFilters) {
    const lf = filters.lightFilters;
    if (lf.emergency) return true;
    if (lf.subtypes?.length > 0) return true;
    if (lf.batteryPowered) return true;
    if (lf.movementSensor) return true;
    if (lf.lightSensor) return true;
  }
  
  if (filters.doorFilters) {
    const df = filters.doorFilters;
    if (df.retained) return true;
    if (df.subtypes?.length > 0) return true;
  }
  
  if (filters.fireFilters) {
    const ff = filters.fireFilters;
    if (ff.subtypes?.length > 0) return true;
  }
  
  return false;
}
