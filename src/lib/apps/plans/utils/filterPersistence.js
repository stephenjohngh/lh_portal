// $lib/apps/plans/utils/filterPersistence.js
// Utilities for persisting report filter state across browser sessions

const STORAGE_KEY = 'plans_report_filters_v1';
const STORAGE_VERSION = 1;
const SAVE_DEBOUNCE_MS = 500;

/**
 * Default filter state
 */
const DEFAULT_FILTERS = {
  floorScope: 'all',
  options: {
    includeImage: true,
    includeElementList: true,
    includeSummary: true
  },
  selectedStatuses: [],
  typeFilters: {
    types: [],
    lightFilters: {},
    communalFilters: {},
    fireFilters: {}
  }
};

/**
 * Load persisted filters from localStorage
 * @returns {Object|null} Loaded filters or null if none/invalid
 */
export function loadPersistedFilters() {
  try {
    // Check if localStorage is available
    if (typeof localStorage === 'undefined') {
      console.info('localStorage not available, filter persistence disabled');
      return null;
    }
    
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }
    
    const data = JSON.parse(stored);
    
    // Validate version
    if (data.version !== STORAGE_VERSION) {
      console.warn(`Filter version mismatch (stored: ${data.version}, expected: ${STORAGE_VERSION}), ignoring stored filters`);
      return null;
    }
    
    // Validate structure
    if (!data.filters || typeof data.filters !== 'object') {
      console.warn('Invalid filter structure, ignoring stored filters');
      return null;
    }
    
    // Merge with defaults to handle missing fields
    return mergeWithDefaults(data.filters);
    
  } catch (err) {
    console.error('Failed to load persisted filters:', err);
    return null;
  }
}

/**
 * Save filters to localStorage (with debouncing)
 * Returns a function that should be called with updated filters
 * @returns {Function} Debounced save function
 */
export function createFilterSaver() {
  let saveTimeout;
  
  return function saveFilters(filters) {
    clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(() => {
      try {
        // Check if localStorage is available
        if (typeof localStorage === 'undefined') {
          return;
        }
        
        const data = {
          version: STORAGE_VERSION,
          timestamp: new Date().toISOString(),
          filters: sanitizeFilters(filters)
        };
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        
      } catch (err) {
        // Handle quota exceeded or other errors
        if (err.name === 'QuotaExceededError') {
          console.error('localStorage quota exceeded, cannot save filters');
        } else {
          console.error('Failed to save filters:', err);
        }
      }
    }, SAVE_DEBOUNCE_MS);
  };
}

/**
 * Clear persisted filters from localStorage
 */
export function clearPersistedFilters() {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    
    localStorage.removeItem(STORAGE_KEY);
    console.info('Persisted filters cleared');
    
  } catch (err) {
    console.error('Failed to clear persisted filters:', err);
  }
}

/**
 * Get default filter state
 * @returns {Object} Deep copy of default filters
 */
export function getDefaultFilters() {
  return JSON.parse(JSON.stringify(DEFAULT_FILTERS));
}

/**
 * Merge loaded filters with defaults to handle missing fields
 * @param {Object} loaded - Loaded filter object
 * @returns {Object} Merged filter object
 */
function mergeWithDefaults(loaded) {
  return {
    floorScope: loaded.floorScope || DEFAULT_FILTERS.floorScope,
    options: {
      ...DEFAULT_FILTERS.options,
      ...(loaded.options || {})
    },
    selectedStatuses: Array.isArray(loaded.selectedStatuses) 
      ? loaded.selectedStatuses 
      : DEFAULT_FILTERS.selectedStatuses,
    typeFilters: {
      types: Array.isArray(loaded.typeFilters?.types) 
        ? loaded.typeFilters.types 
        : DEFAULT_FILTERS.typeFilters.types,
      lightFilters: {
        ...(loaded.typeFilters?.lightFilters || {})
      },
      communalFilters: {
        ...(loaded.typeFilters?.communalFilters || {})
      },
      fireFilters: {
        ...(loaded.typeFilters?.fireFilters || {})
      }
    }
  };
}

/**
 * Sanitize filter object before saving (remove undefined/null values)
 * @param {Object} filters - Filter object to sanitize
 * @returns {Object} Sanitized filter object
 */
function sanitizeFilters(filters) {
  return {
    floorScope: filters.floorScope,
    options: {
      includeImage: !!filters.options?.includeImage,
      includeElementList: !!filters.options?.includeElementList,
      includeSummary: !!filters.options?.includeSummary
    },
    selectedStatuses: Array.isArray(filters.selectedStatuses) 
      ? filters.selectedStatuses.filter(Boolean)
      : [],
    typeFilters: {
      types: Array.isArray(filters.typeFilters?.types)
        ? filters.typeFilters.types.filter(Boolean)
        : [],
      lightFilters: sanitizeObject(filters.typeFilters?.lightFilters),
      communalFilters: sanitizeObject(filters.typeFilters?.communalFilters),
      fireFilters: sanitizeObject(filters.typeFilters?.fireFilters)
    }
  };
}

/**
 * Remove undefined/null values from object
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return {};
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      sanitized[key] = value;
    }
  }
  return sanitized;
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

/**
 * Migrate filters from old version to current version
 * Future-proofing for schema changes
 * @param {Object} data - Stored data with version
 * @returns {Object} Migrated data
 */
function migrateFilters(data) {
  // Currently only version 1 exists, but this is the pattern
  // for future migrations
  
  if (data.version === 1) {
    // Already current version
    return data;
  }
  
  // If we add version 2 in the future:
  // if (data.version === 1) {
  //   return {
  //     version: 2,
  //     filters: {
  //       ...data.filters,
  //       newField: defaultValue
  //     }
  //   };
  // }
  
  // Unknown version, return null to ignore
  return null;
}
