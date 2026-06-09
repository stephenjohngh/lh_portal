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
    id: 'managementmobile',
    name: 'Issues (M)',
    icon: 'clipboard',
    mobile: true,
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Mobile-friendly read-only issues and activity viewer'
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
    name: 'Inspections (M)',
    icon: 'walk',
    mobile: true,
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Mobile-first inspection walk — record results, photos and notes per component'
  },

  {
    id: 'mobileplan',
    name: 'Plans (M)',
    icon: 'grid',
    mobile: true,
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Mobile-first read-only floor plan viewer'
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
    id: 'info',
    name: 'Info',
    icon: 'book',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Building information repository — sections, notes and documents'
  },

  {
    id: 'articles',
    name: 'Articles',
    icon: 'newspaper',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Write and publish public-facing articles at /info/<slug>'
  },

  {
    id: 'mor',
    name: 'MOR',
    icon: 'shield',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Mandatory Occurrence Reporting — BSA 2022 s.87 compliance'
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
  HOME:            'home',
  ADMIN:           'admin',
  MANAGEMENT:      'management',
  BUILDING_ASSETS: 'building_assets',
  INSPECTION:      'inspection',
  MOBILEPLAN:          'mobileplan',
  MANAGEMENT_MOBILE:   'managementmobile',
  MAINTENANCE:     'maintenance',
  INFO:            'info',
  ARTICLES:        'articles',
  MOR:             'mor',
  SETTINGS:        'settings'
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
 * Get apps filtered by user permissions.
 * Admins see every app without needing explicit app_permissions rows.
 * @param {string[]} permittedAppIds - Array of app IDs user has permission for
 * @param {boolean}  isAdmin         - When true, all apps are returned (admin bypass)
 * @returns {AppDefinition[]} Apps user can access
 */
export function getAppsForUser(permittedAppIds = [], isAdmin = false) {
  return AVAILABLE_APPS.filter(app => {
    // Always show apps marked as alwaysVisible
    if (app.alwaysVisible) return true;

    // Admins see all apps without explicit permission grants
    if (isAdmin) return true;

    // Show apps the user has been explicitly granted
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
