// src/lib/apps/plans/utils/elementTemplatePersistence.js
// Utilities for persisting last-used element settings when creating new elements
// Similar to filter persistence, but for element creation templates

const STORAGE_KEY = 'plans_element_template_v1';
const STORAGE_VERSION = 1;

/**
 * Default element template (matches ElementModal defaults)
 */
const DEFAULT_TEMPLATE = {
  element_type:    'communal_door',
  subtype:         'Fire Door',
  status:          'active',
  // Light attributes
  emergency:       false,
  battery:         'none',
  movement_sensor: false,
  light_sensor:    false,
  wattage:         null,
  // Door attributes
  security:        'none',
  retained:        false
};

/**
 * Load persisted element template from localStorage
 * @returns {Object|null} Loaded template or null if none/invalid
 */
export function loadPersistedTemplate() {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }
    
    const data = JSON.parse(stored);
    
    // Validate version
    if (data.version !== STORAGE_VERSION) {
      console.warn(`Template version mismatch (stored: ${data.version}, expected: ${STORAGE_VERSION}), using defaults`);
      return null;
    }
    
    // Validate structure
    if (!data.template || typeof data.template !== 'object') {
      console.warn('Invalid template structure, using defaults');
      return null;
    }
    
    // Return the template merged with defaults to handle missing fields
    return mergeWithDefaults(data.template);
    
  } catch (err) {
    console.error('Failed to load persisted template:', err);
    return null;
  }
}

/**
 * Save element template to localStorage
 * Called after successfully creating a new element
 * @param {Object} element - The element data that was just created
 */
export function saveTemplate(element) {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    
    // Extract only the template-relevant fields
    const template = {
      element_type:    element.element_type,
      subtype:         element.subtype,
      status:          element.status,
      // Light attributes
      emergency:       element.emergency       ?? false,
      battery:         element.battery         ?? 'none',
      movement_sensor: element.movement_sensor ?? false,
      light_sensor:    element.light_sensor    ?? false,
      wattage:         element.wattage         ?? null,
      // Door attributes
      security:        element.security        ?? 'none',
      retained:        element.retained        ?? false
    };
    
    const data = {
      version: STORAGE_VERSION,
      timestamp: new Date().toISOString(),
      template: sanitizeTemplate(template)
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded, cannot save template');
    } else {
      console.error('Failed to save template:', err);
    }
  }
}

/**
 * Clear persisted template from localStorage
 */
export function clearPersistedTemplate() {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    
    localStorage.removeItem(STORAGE_KEY);
    console.info('Persisted element template cleared');
    
  } catch (err) {
    console.error('Failed to clear persisted template:', err);
  }
}

/**
 * Get default template
 * @returns {Object} Deep copy of default template
 */
export function getDefaultTemplate() {
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
}

/**
 * Merge loaded template with defaults to handle missing fields
 * @param {Object} loaded - Loaded template object
 * @returns {Object} Merged template object
 */
function mergeWithDefaults(loaded) {
  return {
    element_type:    loaded.element_type    ?? DEFAULT_TEMPLATE.element_type,
    subtype:         loaded.subtype         ?? DEFAULT_TEMPLATE.subtype,
    status:          loaded.status          ?? DEFAULT_TEMPLATE.status,
    emergency:       loaded.emergency       ?? DEFAULT_TEMPLATE.emergency,
    battery:         loaded.battery         ?? DEFAULT_TEMPLATE.battery,
    movement_sensor: loaded.movement_sensor ?? DEFAULT_TEMPLATE.movement_sensor,
    light_sensor:    loaded.light_sensor    ?? DEFAULT_TEMPLATE.light_sensor,
    wattage:         loaded.wattage         ?? DEFAULT_TEMPLATE.wattage,
    security:        loaded.security        ?? DEFAULT_TEMPLATE.security,
    retained:        loaded.retained        ?? DEFAULT_TEMPLATE.retained
  };
}

/**
 * Sanitize template object before saving
 * @param {Object} template - Template object to sanitize
 * @returns {Object} Sanitized template object
 */
function sanitizeTemplate(template) {
  return {
    element_type:    template.element_type    || DEFAULT_TEMPLATE.element_type,
    subtype:         template.subtype         || DEFAULT_TEMPLATE.subtype,
    status:          template.status          || DEFAULT_TEMPLATE.status,
    emergency:       !!template.emergency,
    battery:         template.battery         || 'none',
    movement_sensor: !!template.movement_sensor,
    light_sensor:    !!template.light_sensor,
    wattage:         template.wattage ? Number(template.wattage) : null,
    security:        template.security        || 'none',
    retained:        !!template.retained
  };
}

/**
 * Check if localStorage is available
 * @returns {boolean} True if available
 */
export function isLocalStorageAvailable() {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (err) {
    return false;
  }
}
