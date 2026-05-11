// src/lib/apps/apps.js
/**
 * Centralized app configuration
 * Single source of truth for all available apps in the system
 */

/**
 * Available app definitions
 * @typedef {Object} AppDefinition
 * @property {string} id - Unique app identifier (matches database app_id)
 * @property {string} name - Display name
 * @property {string} icon - Icon name (from Icon component)
 * @property {boolean} alwaysVisible - Show to all users regardless of permissions
 * @property {boolean} requiresPermission - Requires explicit permission in app_permissions table
 * @property {string} [description] - Optional description for UI
 */

export const AVAILABLE_APPS = [
  {
    id: 'home',
    name: 'Home',
    icon: 'home',
    alwaysVisible: true,
    requiresPermission: false,
    description: 'Dashboard and app overview'
  },
  {
    id: 'admin',
    name: 'Admin',
    icon: 'users',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Manage users and app permissions'
  },
  {
    id: 'management',
    name: 'Management',
    icon: 'clipboard',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Track and manage building issues'
  },
{
    id: 'demo2',
    name: 'Demo App 2',
    icon: 'lhlogo',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Explore app components'
  },

  {
    id: 'building_assets',
    name: 'Building Assets',
    icon: 'lhlogo',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Building asset management - type hierarchy, components, floor plans and reports'
  },

  {
    id: 'inspection',
    name: 'Inspection',
    icon: 'walk',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Mobile inspection walk using the v2 component data model'
  },

  {
    id: 'mobileplan',
    name: 'Mobile Plan',
    icon: 'grid',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Mobile read-only floor plan viewer using the v2 component data model'
  },

  {
    id: 'maintenance',
    name: 'Maintenance',
    icon: 'calendar',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Schedule and record maintenance jobs; track overdue and upcoming tasks'
  },

  {
    id: 'settings',
    name: 'Settings',
    icon: 'settings',
    alwaysVisible: true,
    requiresPermission: false,
    description: 'Update your account settings'
  }
];

/**
 * App ID constants for type safety
 * Use these instead of magic strings
 */
export const APP_IDS = {
  HOME:    'home',
  ADMIN:   'admin',
  MANAGEMENT: 'management',
  DEMO:    'demo',
  DEMO2:   'demo2',
  BUILDING_ASSETS: 'building_assets',
  INSPECTION: 'inspection',
  MOBILEPLAN:   'mobileplan',
  MAINTENANCE:  'maintenance',
  SETTINGS:     'settings'
};

/**
 * Get apps that require explicit permission
 * @returns {AppDefinition[]} Apps that need app_permissions entry
 */
export function getPermissionedApps() {
  return AVAILABLE_APPS.filter(app => app.requiresPermission);
}

/**
 * Get apps that are always visible to all users
 * @returns {AppDefinition[]} Apps shown to everyone
 */
export function getAlwaysVisibleApps() {
  return AVAILABLE_APPS.filter(app => app.alwaysVisible);
}

/**
 * Get app definition by ID
 * @param {string} appId - App identifier
 * @returns {AppDefinition|undefined} App definition or undefined if not found
 */
export function getAppById(appId) {
  return AVAILABLE_APPS.find(app => app.id === appId);
}

/**
 * Get apps filtered by user permissions
 * @param {string[]} permittedAppIds - Array of app IDs user has permission for
 * @returns {AppDefinition[]} Apps user can access
 */
export function getAppsForUser(permittedAppIds = []) {
  return AVAILABLE_APPS.filter(app => {
    // Always show apps marked as alwaysVisible
    if (app.alwaysVisible) return true;
    
    // Show apps user has permission for
    if (app.requiresPermission && permittedAppIds.includes(app.id)) {
      return true;
    }
    
    return false;
  });
}

/**
 * Validate if an app ID exists in the system
 * @param {string} appId - App identifier to validate
 * @returns {boolean} True if app exists
 */
export function isValidAppId(appId) {
  return AVAILABLE_APPS.some(app => app.id === appId);
}

/**
 * Get all app IDs that require permissions
 * Useful for permission management interfaces
 * @returns {string[]} Array of app IDs
 */
export function getPermissionedAppIds() {
  return getPermissionedApps().map(app => app.id);
}
