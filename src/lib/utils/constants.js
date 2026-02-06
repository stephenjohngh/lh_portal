// src/lib/utils/constants.js

/**
 * Issue status values
 */
export const ISSUE_STATUS = {
  CURRENT: 'current',
  PARKED: 'parked',
  COMPLETED: 'completed'
};

/**
 * Action status values
 */
export const ACTION_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed'
};

/**
 * Status filter options for the dropdown
 */
export const STATUS_FILTERS = [
  { value: ISSUE_STATUS.CURRENT, label: 'Current Issues' },
  { value: ISSUE_STATUS.PARKED, label: 'Parked Issues' },
  { value: ISSUE_STATUS.COMPLETED, label: 'Completed Issues' }
];

/**
 * Issue status options for forms
 */
export const ISSUE_STATUS_OPTIONS = [
  { value: ISSUE_STATUS.CURRENT, label: 'Current' },
  { value: ISSUE_STATUS.PARKED, label: 'Parked' },
  { value: ISSUE_STATUS.COMPLETED, label: 'Completed' }
];

/**
 * Action status options for dropdowns
 */
export const ACTION_STATUS_OPTIONS = [
  { value: ACTION_STATUS.PENDING, label: 'Pending' },
  { value: ACTION_STATUS.IN_PROGRESS, label: 'In Progress' },
  { value: ACTION_STATUS.COMPLETED, label: 'Completed' }
];

/**
 * UI Color constants
 */
export const UI_COLORS = {
  // Action-related colors (amber theme)
  ACTION_PRIMARY: 'amber-800',        // For buttons, icons, primary action elements
  ACTION_BORDER: 'amber-500',         // For borders when expanded/active
  ACTION_BG: 'amber-600',            // For backgrounds
  ACTION_TEXT: 'amber-400',          // For text/icons in dark mode
  
  // Comment-related colors (blue theme)
  COMMENT_PRIMARY: 'blue-600',
  COMMENT_BORDER: 'blue-500',
  COMMENT_TEXT: 'blue-400'
};

/**
 * Get Tailwind class for action color
 * @param {string} prefix - Tailwind prefix (bg-, text-, border-, etc.)
 * @returns {string} Full Tailwind class
 */
export function getActionColor(prefix = 'bg') {
  return `${prefix}-${UI_COLORS.ACTION_PRIMARY}`;
}

/**
 * Get Tailwind class for comment color
 * @param {string} prefix - Tailwind prefix (bg-, text-, border-, etc.)
 * @returns {string} Full Tailwind class
 */
export function getCommentColor(prefix = 'bg') {
  return `${prefix}-${UI_COLORS.COMMENT_PRIMARY}`;
}
