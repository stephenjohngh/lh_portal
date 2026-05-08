// src/lib/apps/issues/components/reports/reportUtils.js
import { ACTION_STATUS, ACTIVITY_TYPE, ISSUE_STATUS } from '$lib/utils/constants';
import { fmtDate, fmtDateLong } from '$lib/utils/dates';


/**
 * Build a compact one-line summary string for structured activity types
 * (email, call, letter). Returns '' for types without structured fields.
 * Used by the report preview card and the Word doc generator.
 *
 * Field dates are stored as YYYY-MM-DD; noon time is appended to avoid
 * timezone-shift issues when passing to fmtDate.
 *
 * @param {string} activityType
 * @param {object|null} fields
 * @returns {string}
 */
export function buildFieldSummary(activityType, fields) {
  const f = fields || {};
  if (activityType === ACTIVITY_TYPE.EMAIL) {
    const parts = [];
    if (f.from || f.to) parts.push(`${f.from || '?'} → ${f.to || '?'}`);
    if (f.subject)       parts.push(`Re: ${f.subject}`);
    if (f.email_date)    parts.push(fmtDate(f.email_date + 'T12:00:00'));
    return parts.join(' · ');
  }
  if (activityType === ACTIVITY_TYPE.CALL) {
    return [f.direction, f.caller, f.duration].filter(Boolean).join(' · ');
  }
  if (activityType === ACTIVITY_TYPE.LETTER) {
    const parts = [];
    if (f.from || f.to) parts.push(`${f.from || '?'} → ${f.to || '?'}`);
    if (f.reference)    parts.push(`Ref: ${f.reference}`);
    if (f.letter_date)  parts.push(fmtDate(f.letter_date + 'T12:00:00'));
    return parts.join(' · ');
  }
  return '';
}

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

  // An activity (comment/decision) or action was ADDED on or after the filter date
  if ((issue.activities || []).some(a => hasBeenUpdatedSince(a.created_at, filterDateTime))) return true;
  if ((issue.actions    || []).some(a => hasBeenUpdatedSince(a.created_at, filterDateTime))) return true;

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
 * Filter and process issues for the report.
 *
 * @param {Array}  issues     - Raw issues from the store
 * @param {string} filterDate - ISO date string (YYYY-MM-DD) or ''
 * @param {object} options
 *   includeHistoric         {boolean} - show historic comments/decisions
 *   includeCompletedActions {boolean} - show completed actions alongside outstanding ones
 *   issueNumbers            {number[]} - if non-empty, show ONLY these issue numbers,
 *                                        bypassing the date filter (for drill-down)
 */
export function filterIssues(issues, filterDate, options = {}) {
  const {
    includeHistoric         = false,
    includeCompletedActions = false,
    issueNumbers            = []
  } = options;

  const filterDateTime = filterDate ? new Date(filterDate).getTime() : null;

  // When specific issue numbers are requested, bypass date + historic-issue
  // filters entirely — the user is doing a targeted lookup.
  let baseIssues;
  if (issueNumbers.length > 0) {
    baseIssues = issues.filter(issue => issueNumbers.includes(issue.issue_number));
  } else {
    baseIssues = issues
      .filter(issue => !issue.historic)
      .filter(issue => !filterDateTime || hasRecentChanges(issue, filterDateTime));
  }

  // When doing an issue-number drill-down we bypass date filtering for sub-items
  // too — show everything for the requested issues.
  const filterSubItems = !!filterDateTime && issueNumbers.length === 0;

  return baseIssues
    .map(issue => ({
      ...issue,
      // Activities: filter by date (when active), then by historic flag.
      // Pass through as a unified array; ReportIssueCard splits by activity_type.
      activities: (issue.activities || [])
        .filter(a => !filterSubItems || hasBeenUpdatedSince(a.created_at, filterDateTime))
        .filter(a => includeHistoric || issue.status === ISSUE_STATUS.COMPLETED || !a.historic),
      // Actions: filter by date (when active), then by completion status.
      // Sort outstanding before completed, then by created_at ASC within each group
      // (the card re-sorts by the user's chosen direction).
      outstandingActions: (issue.actions || [])
        .filter(a => !filterSubItems || hasBeenUpdatedSince(a.created_at, filterDateTime))
        .filter(a => includeCompletedActions || a.status !== ACTION_STATUS.COMPLETED)
        .slice().sort((a, b) => {
          const aC = a.status === ACTION_STATUS.COMPLETED ? 1 : 0;
          const bC = b.status === ACTION_STATUS.COMPLETED ? 1 : 0;
          if (aC !== bC) return aC - bC;
          return new Date(a.created_at) - new Date(b.created_at);
        })
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
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
