// src/lib/utils/appAccess.js
//
// May this account use this app? An admin may use every app; anyone else
// needs the app granted on Admin → Users (`app_permissions`).
//
// Written out by hand in each shell that gates on it until 2026-10-02, as
// `isAdmin || !!$permissions.appPermissions?.<app>?.hasAccess`.

/**
 * @param {{ isAdmin?: boolean, appPermissions?: Record<string, { hasAccess?: boolean }> } | null | undefined} state
 *        the permissions store's value
 * @param {string} appId
 */
export function hasAppAccess(state, appId) {
  return !!state?.isAdmin || !!state?.appPermissions?.[appId]?.hasAccess;
}

/**
 * The tabs this account may see: admin-only tabs are dropped for anyone else.
 * @template {{ adminOnly?: boolean }} T
 * @param {T[]} tabs
 * @param {boolean} isAdmin
 * @returns {T[]}
 */
export function visibleTabs(tabs, isAdmin) {
  return (tabs ?? []).filter((t) => !t.adminOnly || isAdmin);
}
