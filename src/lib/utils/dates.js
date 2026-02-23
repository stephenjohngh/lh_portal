// src/lib/utils/dates.js
// Shared date/time formatting utilities for the LH Portal.
//
// All en-GB display functions are grouped at the top.
// Legacy en-US functions (used by IssuesTrackerApp) are preserved below.

// ── en-GB helpers (Walk, Plans, Reports) ────────────────────────────────────

const GB = 'en-GB';

/**
 * "23 Feb 2026"
 * @param {string|null} iso
 */
export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(GB, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * "14:35"
 * @param {string|null} iso
 */
export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(GB, { hour: '2-digit', minute: '2-digit' });
}

/**
 * "23 Feb 2026 14:35"
 * @param {string|null} iso
 */
export function fmtDateTime(iso) {
  if (!iso) return '—';
  return fmtDate(iso) + ' ' + fmtTime(iso);
}

/**
 * Current datetime formatted for document headers/cover pages.
 * "23 Feb 2026, 14:35"
 */
export function fmtGenerated() {
  return new Date().toLocaleString(GB, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Duration between two ISO timestamps.
 * Returns "15 min", "1h 30m", or "Open" if endIso is null/undefined.
 * @param {string} startIso
 * @param {string|null} endIso
 */
export function fmtDuration(startIso, endIso) {
  if (!endIso) return 'Open';
  const min = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ── Legacy en-US helpers (used by IssuesTrackerApp, AuditDashboard etc.) ────
// These are preserved as-is to avoid changing behaviour in parts of the app
// that weren't part of the refactor.

/**
 * Format a date string to a readable date (e.g., "Jan 15, 2025")
 * @param {string} dateString - ISO date string
 * @param {string} userName - Optional username to append
 * @returns {string} Formatted date
 */
export function formatDate(dateString, userName = null) {
  if (!dateString) return 'N/A';
  const formatted = new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  return userName ? `${formatted} (${userName})` : formatted;
}

/**
 * Format a date string to a readable date and time (e.g., "Jan 15, 2025, 2:30 PM")
 * @param {string} dateString - ISO date string
 * @param {string} userName - Optional username to append
 * @returns {string} Formatted date and time
 */
export function formatDateTime(dateString, userName = null) {
  if (!dateString) return 'N/A';
  const formatted = new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  return userName ? `${formatted} (${userName})` : formatted;
}

/**
 * Check if a deadline date is overdue (past today's date)
 * @param {string} deadlineString - ISO date string
 * @returns {boolean} True if deadline is in the past
 */
export function isOverdue(deadlineString) {
  if (!deadlineString) return false;
  const deadline = new Date(deadlineString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  return deadline < today;
}

/**
 * Get relative time string (e.g., "2h ago", "3d ago")
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time description
 */
export function getRelativeTime(dateString) {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1)  return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7)  return `${diffDays}d ago`;
  return formatDate(dateString);
}

/**
 * Calculate days until a deadline
 * @param {string} deadlineString - ISO date string
 * @returns {number} Number of days (negative if overdue)
 */
export function daysUntilDeadline(deadlineString) {
  if (!deadlineString) return null;
  const deadline = new Date(deadlineString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  const diffMs = deadline - today;
  return Math.ceil(diffMs / 86400000);
}

/**
 * Format date with full month name (e.g., "January 30, 2026")
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date with full month
 */
export function formatDateLong(dateString) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format date and time with full details (for user management, etc.)
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date and time
 */
export function formatDateTimeFull(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format relative time with full words (e.g., "2 hours ago", "3 days ago")
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time in full words
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60)  return 'just now';
  if (diffMins < 60)  return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 30)  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return formatDate(dateString);
}

/**
 * Check if date is today
 * @param {string} dateString - ISO date string
 * @returns {boolean} True if date is today
 */
export function isToday(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Check if date is within the past week
 * @param {string} dateString - ISO date string
 * @returns {boolean} True if within past 7 days
 */
export function isWithinPastWeek(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  return date >= weekAgo;
}

/**
 * Check if a record was modified after creation
 * @param {string} createdAt - ISO date string of creation
 * @param {string} updatedAt - ISO date string of last update
 * @returns {boolean} True if modified more than 1 second after creation
 */
export function wasModified(createdAt, updatedAt) {
  if (!updatedAt || !createdAt) return false;
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  return Math.abs(updated - created) > 1000;
}
