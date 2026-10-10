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
 * @property {string} [grantId] - Shown to whoever holds THIS app's grant, and not
 *           granted on its own (Parking (M) uses the Parking grant: same data, same RLS)
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
    description: 'Building asset management - type hierarchy, components, floor schematics and reports'
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
    name: 'Schematics (M)',
    icon: 'grid',
    mobile: true,
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Mobile-first read-only floor schematic viewer'
  },

  {
    id: 'parkingmobile',
    name: 'Parking (M)',
    icon: 'search',
    mobile: true,
    alwaysVisible: false,
    requiresPermission: true,
    grantId: 'parking',
    description: 'Registration Lookup on a phone — works in the basement without a signal'
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
    description: 'Building information — notes & documents; publish any to /info/<slug>'
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
    id: 'golden_thread',
    name: 'Golden Thread',
    icon: 'newspaper',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'BSA 2022 s.88 controlled document register — the building information CDE (ISO 19650)'
  },

  {
    id: 'dossier',
    name: 'Dossier',
    icon: 'book',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Author briefing packs for people outside the portal'
  },

  {
    id: 'planner',
    name: 'Planner',
    icon: 'calendar',
    alwaysVisible: false,
    requiresPermission: true,
    description: "The building's recurring year — what is outstanding, and what is coming up"
  },

  {
    // Granted per user on Admin → Users, like Building Assets (user,
    // 2026-09-23). A non-admin with the grant sees ONLY Inspection walks, and
    // only their own (walk_sessions RLS); every register tab is admin-only,
    // enforced in ComplianceApp. Admins bypass grants in getAppsForUser.
    id: 'compliance',
    name: 'Compliance',
    icon: 'shield',
    alwaysVisible: false,
    requiresPermission: true,
    description: "This building's compliance obligations, what is planned against them, and the evidence"
  },

  {
    id: 'complaints',
    name: 'Complaints',
    icon: 'comment',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'Building-safety complaints (BSA s.93) — receive, investigate, respond'
  },

  {
    // The basement bays and, from P1, who holds them. Granted per user on
    // Admin → Users; the parking tables' RLS is gated on the same grant,
    // because from P1 they hold the details of people who are not staff.
    // docs/requirements/app_designs/Parking_App_Design.md.
    id: 'parking',
    name: 'Parking',
    icon: 'map',
    alwaysVisible: false,
    requiresPermission: true,
    description: 'The car park bays: sizes, where they are, and whether each can be allocated'
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
 * Get apps that require explicit permission
 * @returns {AppDefinition[]} Apps that need app_permissions entry
 */
export function getPermissionedApps() {
  return AVAILABLE_APPS.filter(app => app.requiresPermission && !app.grantId);
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
    if (app.requiresPermission && permittedAppIds.includes(app.grantId ?? app.id)) {
      return true;
    }

    return false;
  });
}

