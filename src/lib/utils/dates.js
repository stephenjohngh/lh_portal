// src/lib/utils/dates.js
// Shared date/time formatting utilities for the LH Portal.
//
// Single locale: en-GB ("23 Feb 2026", "14:35"). Use these helpers
// everywhere — never inline toLocaleDateString / toLocaleString.

const GB = 'en-GB';

/**
 * "23 Feb 2026" — or "23 Feb 2026 (Stephen)" when userName is given.
 * @param {string|null} iso
 * @param {string|null} [userName]  Optional name appended in parentheses.
 */
export function fmtDate(iso, userName = null) {
  if (!iso) return '—';
  const formatted = new Date(iso).toLocaleDateString(GB, {
    day:   '2-digit',
    month: 'short',
    year:  'numeric'
  });
  return userName ? `${formatted} (${userName})` : formatted;
}

/**
 * "23 February 2026" — full month name. Used in document headers.
 * @param {string|null} iso
 */
export function fmtDateLong(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(GB, {
    day:   '2-digit',
    month: 'long',
    year:  'numeric'
  });
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
 * "23 Feb 2026 14:35" — or with a "(name)" suffix when userName is given.
 * @param {string|null} iso
 * @param {string|null} [userName]
 */
export function fmtDateTime(iso, userName = null) {
  if (!iso) return '—';
  const formatted = `${fmtDate(iso)} ${fmtTime(iso)}`;
  return userName ? `${formatted} (${userName})` : formatted;
}

/**
 * Current datetime formatted for document headers / cover pages.
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

/**
 * True when the deadline is strictly before today (00:00 local).
 * @param {string|null} deadlineIso
 */
export function isOverdue(deadlineIso) {
  if (!deadlineIso) return false;
  const deadline = new Date(deadlineIso);
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  return deadline < today;
}

/**
 * True when updatedAt is more than 1s after createdAt — i.e. the record
 * has been modified since creation.
 * @param {string|null} createdAt
 * @param {string|null} updatedAt
 */
export function wasModified(createdAt, updatedAt) {
  if (!updatedAt || !createdAt) return false;
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  return Math.abs(updated - created) > 1000;
}

/**
 * Converts a UTC ISO timestamp to the `yyyy-MM-ddTHH:mm` string expected
 * by `<input type="datetime-local">`, expressed in the user's local time.
 * Round-trip: `new Date(value).toISOString()` converts back to UTC.
 * @param {string|null} iso
 */
export function toDateTimeLocal(iso) {
  if (!iso) return '';
  const d   = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
