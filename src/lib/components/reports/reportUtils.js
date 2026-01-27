// src/lib/components/reports/reportUtils.js
import { ACTION_STATUS, ISSUE_STATUS } from '$lib/utils/constants';
import { formatDate } from '$lib/utils/dates';

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
 * Check if an issue has recent changes (issue, comments, or actions)
 */
export function hasRecentChanges(issue, filterDateTime) {
  if (!filterDateTime) return true;
  
  const issueUpdated = hasBeenUpdatedSince(issue.updated_at, filterDateTime);
  const hasRecentComments = (issue.comments || []).some(c => 
    hasBeenUpdatedSince(c.updated_at, filterDateTime)
  );
  const hasRecentActions = (issue.actions || []).some(a => 
    hasBeenUpdatedSince(a.updated_at, filterDateTime)
  );
  
  return issueUpdated || hasRecentComments || hasRecentActions;
}

/**
 * Format timestamp with creation and modification dates
 */
export function formatTimestamp(createdAt, updatedAt) {
  const created = formatDate(createdAt);
  const hasModification = updatedAt && 
    new Date(updatedAt).getTime() !== new Date(createdAt).getTime();
  const modified = hasModification ? ` • Modified: ${formatDate(updatedAt)}` : '';
  return created + modified;
}

/**
 * Filter and process issues for the report
 */
export function filterIssues(issues, filterDate) {
  const filterDateTime = filterDate ? new Date(filterDate).getTime() : null;
  
  return issues
    .filter(issue => !filterDateTime || hasRecentChanges(issue, filterDateTime))
    .map(issue => ({
      ...issue,
      outstandingActions: (issue.actions || []).filter(
        action => action.status !== ACTION_STATUS.COMPLETED
      )
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
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
 * Get today's date formatted for display
 */
export function getTodayDate() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Generate filter summary text
 */
export function getFilterSummary(includeCurrent, includeParked, includeCompleted, filterDate) {
  const statuses = [
    includeCurrent && 'Current',
    includeParked && 'Parked',
    includeCompleted && 'Completed'
  ].filter(Boolean).join(', ');
  
  const dateInfo = filterDate
    ? `Changes since ${new Date(filterDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`
    : 'All changes';
  
  return `Showing: ${statuses} • ${dateInfo}`;
}
