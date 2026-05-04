// src/lib/apps/issues/components/reports/reportUtils.js
import { ACTION_STATUS, ISSUE_STATUS } from '$lib/utils/constants';
import { fmtDate, fmtDateLong } from '$lib/utils/dates';


/**
 * Status color configurations for different issue states
 */
export const STATUS_COLORS = {
  current: { 
    header: 'bg-gray-100', 
    border: 'border-gray-300', 
    sectionBorder: 'border-gray-300', 
    barColor: 'border-blue-500' 
  },
  parked: { 
    header: 'bg-amber-50', 
    border: 'border-amber-200', 
    sectionBorder: 'border-amber-200', 
    barColor: 'border-amber-500' 
  },
  completed: { 
    header: 'bg-green-50', 
    border: 'border-green-200', 
    sectionBorder: 'border-green-200', 
    barColor: 'border-green-500' 
  }
};

/**
 * Check if a timestamp has been updated since a given date
 */
export function hasBeenUpdatedSince(timestamp, filterDateTime) {
  return timestamp && new Date(timestamp).getTime() >= filterDateTime;
}

/**
 * Check if an issue has activity (created) since the filter date.
 *
 * "Activity since" means items CREATED on or after the date — not items that
 * were merely edited (e.g. status changes, action completions). Using
 * updated_at caused old issues to surface whenever a status was changed or
 * an action was marked complete, even though no new content had been added.
 */
export function hasRecentChanges(issue, filterDateTime) {
  if (!filterDateTime) return true;

  // Issue itself was created on or after the filter date
  if (hasBeenUpdatedSince(issue.created_at, filterDateTime)) return true;

  // A comment, decision, or action was ADDED on or after the filter date
  if ((issue.comments  || []).some(c => hasBeenUpdatedSince(c.created_at, filterDateTime))) return true;
  if ((issue.decisions || []).some(d => hasBeenUpdatedSince(d.created_at, filterDateTime))) return true;
  if ((issue.actions   || []).some(a => hasBeenUpdatedSince(a.created_at, filterDateTime))) return true;

  return false;
}

/**
 * Format timestamp with creation and modification dates
 */
export function formatTimestamp(createdAt, updatedAt) {
  const created = fmtDate(createdAt);
  const hasModification = updatedAt && 
    new Date(updatedAt).getTime() !== new Date(createdAt).getTime();
  const modified = hasModification ? ` • Modified: ${fmtDate(updatedAt)}` : '';
  return created + modified;
}

/**
 * Filter and process issues for the report
 */
export function filterIssues(issues, filterDate) {
  const filterDateTime = filterDate ? new Date(filterDate).getTime() : null;
  
  return issues
    .filter(issue => !issue.historic) // Filter out historic issues
    .filter(issue => !filterDateTime || hasRecentChanges(issue, filterDateTime))
    .map(issue => ({
      ...issue,
      // For completed issues, include ALL comments/decisions (even historic)
      // For non-completed issues, filter out historic ones
      comments: issue.status === ISSUE_STATUS.COMPLETED
        ? (issue.comments || [])
        : (issue.comments || []).filter(c => !c.historic),
      decisions: issue.status === ISSUE_STATUS.COMPLETED
        ? (issue.decisions || [])
        : (issue.decisions || []).filter(d => !d.historic),
      // Filter out completed actions
      outstandingActions: (issue.actions || []).filter(
        action => action.status !== ACTION_STATUS.COMPLETED
      )
    }))
    .sort((a, b) => {
      // Sort by priority first
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by created_at (not updated_at)
      return new Date(a.created_at) - new Date(b.created_at);
    });
}

/**
 * Group issues by status
 */
export function groupIssuesByStatus(issues) {
  return {
    current: issues.filter(i => (i.status || 'current') === ISSUE_STATUS.CURRENT),
    parked: issues.filter(i => i.status === ISSUE_STATUS.PARKED),
    completed: issues.filter(i => i.status === ISSUE_STATUS.COMPLETED)
  };
}

/**
 * Get default filter date (one month ago)
 */
export function getDefaultFilterDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().split('T')[0];
}

/**
 * Today's date for the printed report header (en-GB, full month).
 */
export function getTodayDate() {
  return fmtDateLong(new Date().toISOString());
}

/**
 * Generate filter summary text (en-GB).
 */
export function getFilterSummary(includeCurrent, includeParked, includeCompleted, filterDate) {
  const statuses = [
    includeCurrent && 'Current',
    includeParked && 'Parked',
    includeCompleted && 'Completed'
  ].filter(Boolean).join(', ');

  const dateInfo = filterDate
    ? `Created since ${fmtDate(new Date(filterDate).toISOString())}`
    : 'All dates';

  return `Showing: ${statuses} • ${dateInfo}`;
}
