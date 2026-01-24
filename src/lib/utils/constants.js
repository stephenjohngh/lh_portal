// src/lib/utils/constants.js

/**
 * Issue status values
 */
export const ISSUE_STATUS = {
  CURRENT: 'current',
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
  { value: ISSUE_STATUS.COMPLETED, label: 'Completed Issues' }
];

/**
 * Action status options for dropdowns
 */
export const ACTION_STATUS_OPTIONS = [
  { value: ACTION_STATUS.PENDING, label: 'Pending' },
  { value: ACTION_STATUS.IN_PROGRESS, label: 'In Progress' },
  { value: ACTION_STATUS.COMPLETED, label: 'Completed' }
];
