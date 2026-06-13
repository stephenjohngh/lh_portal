// src/lib/components/common/protectedButtonVisibility.js
// Pure permission-gating logic for ProtectedButton — extracted from the
// component so the rules can be unit-tested without rendering (Type-1 in the
// testing blueprint; see CLAUDE.md "Testing").

/**
 * Should the button be shown for the given permissions?
 * @param {{ loading?: boolean, isAdmin?: boolean, canModify?: boolean }} perms
 * @param {'view'|'modify'} actionType
 * @param {boolean} adminRequired
 */
export function determineVisibility(perms, actionType, adminRequired) {
  if (perms.loading) return false;        // still loading permissions
  if (perms.isAdmin) return true;         // admins see everything
  if (adminRequired) return false;        // admin-only, caller is not admin
  if (actionType === 'view') return true; // view actions always visible
  if (actionType === 'modify') return perms.canModify;
  return true;                            // unknown action → fail open
}

/**
 * Tooltip explaining why a hidden control is unavailable (empty when shown
 * or when no helpful message applies).
 */
export function getTooltipText(perms, actionType, adminRequired, customTooltip) {
  if (customTooltip) return customTooltip;
  if (determineVisibility(perms, actionType, adminRequired)) return '';
  if (adminRequired) return 'Admin access required';
  if (actionType === 'modify' && perms.isReadOnly) return 'You have read-only access';
  return '';
}
