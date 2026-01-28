// src/lib/utils/dates.js

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
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
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
