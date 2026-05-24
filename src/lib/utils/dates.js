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
 * "23 Feb 2026 14:35:42" — like fmtDateTime but includes seconds.
 * Used by the audit log where second-level precision matters.
 * @param {string|null} iso
 */
export function fmtDateTimeSec(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(GB, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
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
 * "23 Feb 2026" — alias of fmtDate kept for callers that want a more
 * explicit name; uses `day: 'numeric'` so single-digit days render as
 * "5 Feb 2026" rather than "05 Feb 2026".
 * @param {string|null} iso
 */
export function fmtShortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(GB, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * "23 Feb 2026" for a DB `date` column value like "2026-02-23".
 *
 * `new Date('2026-02-23')` is parsed as UTC midnight and may render as the
 * previous day in negative-offset timezones. We append `T00:00:00` so it's
 * parsed as local midnight — the value the user actually picked.
 * Use this for any field whose DB type is `date` (not `timestamptz`).
 * @param {string|null} dateStr  "YYYY-MM-DD"
 */
export function fmtDateOnly(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(GB, {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Current date as "23 Feb 2026" — convenience wrapper for fmtDate(today). */
export function fmtToday() {
  return fmtDate(new Date().toISOString());
}

/**
 * Compact month-year string used in auto-generated session names.
 * "Apr26" — short month + 2-digit year, no separator.
 * @param {Date} [date]  defaults to now
 */
export function fmtMonthYearCompact(date = new Date()) {
  const month = date.toLocaleDateString(GB, { month: 'short' });
  const year  = date.toLocaleDateString(GB, { year:  '2-digit' });
  return `${month}${year}`;
}

/**
 * Format a Date or ISO string as YYYY-MM-DD (UTC).
 * Useful for `<input type="date">` values and DB date columns.
 * @param {Date|string} value
 */
export function toDateString(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

/** Today as a YYYY-MM-DD string (UTC). */
export function today() {
  return toDateString(new Date());
}

/**
 * Add N days to a date; returns a new Date object.
 * @param {Date|string} date
 * @param {number} days
 */
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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
