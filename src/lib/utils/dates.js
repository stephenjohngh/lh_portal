// src/lib/utils/dates.js
// Shared date/time formatting utilities for the LH Portal.
//
// Single locale: en-GB ("23 Feb 2026", "14:35"). Use these helpers
// everywhere — never inline toLocaleDateString / toLocaleString.

const GB = 'en-GB';

/**
 * The building's time zone. There is ONE building and it is in England
 * (standing decision, CLAUDE.md), so dates and times are London's — not UTC,
 * and not whatever zone the code happens to run in. The Word documents are
 * made on a server that runs in UTC: until 2026-10-02 they printed times an
 * hour behind London all summer, "Generated …" included.
 */
export const BUILDING_TIME_ZONE = 'Europe/London';

/** Locale options every formatter shares: en-GB, in London. */
const LONDON = { timeZone: BUILDING_TIME_ZONE };

/**
 * "23 Feb 2026" — or "23 Feb 2026 (Stephen)" when userName is given.
 * @param {string|null} iso
 * @param {string|null} [userName]  Optional name appended in parentheses.
 */
export function fmtDate(iso, userName = null) {
  if (!iso) return '—';
  const formatted = new Date(iso).toLocaleDateString(GB, {
    ...LONDON,
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
    ...LONDON,
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
  return new Date(iso).toLocaleTimeString(GB, { ...LONDON, hour: '2-digit', minute: '2-digit' });
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
    ...LONDON,
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
    ...LONDON,
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
  const min = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

/**
 * True when the deadline's calendar date is before today's, both in London.
 * @param {string|null} deadlineIso  a 'YYYY-MM-DD' date or a timestamp
 */
export function isOverdue(deadlineIso) {
  if (!deadlineIso) return false;
  return daysUntil(deadlineIso) < 0;
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
    ...LONDON,
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * "23 Feb 2026" for a DB `date` column value like "2026-02-23".
 *
 * A calendar date has no time zone, so it is shown exactly as stored: read as
 * UTC midnight and formatted in UTC, which no browser or server zone can move
 * to the day before or after. (It used to parse at LOCAL midnight, which is
 * right only where the code runs in London.)
 * Use this for any field whose DB type is `date` (not `timestamptz`).
 * @param {string|null} dateStr  "YYYY-MM-DD"
 */
export function fmtDateOnly(dateStr) {
  if (!dateStr) return '—';
  try {
    // A calendar date shown as itself: UTC midnight, read back in UTC, so no
    // zone — the browser's or the server's — can move it to another day.
    return new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z').toLocaleDateString(GB, {
      timeZone: 'UTC',
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
  const month = date.toLocaleDateString(GB, { ...LONDON, month: 'short' });
  const year  = date.toLocaleDateString(GB, { ...LONDON, year:  '2-digit' });
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

// ── Calendar days — the ONE owner of day arithmetic (2026-10-02) ─────────────
//
// Before this, "today" was written by hand 56 times as
// `new Date().toISOString().slice(0, 10)`, `daysBetween` three times and
// `addDaysISO` three times, with raw milliseconds-per-day maths in 17 files.
// They mostly agreed, which is luck rather than design: Maintenance counted
// from LOCAL midnight while the rest counted in UTC, and the BST infinite loop
// of 2026-09-10 came from exactly that mix. Day arithmetic lives here now.

/** Milliseconds in a calendar day, for date-only (UTC) arithmetic. */
export const DAY_MS = 86_400_000;

// en-CA formats a date as YYYY-MM-DD.
const londonISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUILDING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * Today as 'YYYY-MM-DD' — the calendar date in London.
 *
 * ⚠ It used to be the UTC date, so between midnight and 1 am under BST it
 * returned YESTERDAY: something due yesterday was not yet overdue, and a date
 * stamped "today" was a day early.
 *
 * @param {Date} [now]  for tests; defaults to the current instant
 */
export function today(now = new Date()) {
  return londonISO.format(now);
}

/**
 * The London calendar date of a value, as 'YYYY-MM-DD'.
 * A plain 'YYYY-MM-DD' (a DB `date` column) is already a calendar date and is
 * returned as it is; a timestamp or a Date is an INSTANT, and its calendar
 * date is the one in London — cutting a timestamp to its first ten characters
 * would give its UTC date instead. '' when unreadable.
 * @param {string|Date|null|undefined} value
 */
export function calendarDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : today(value);
  const s = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : today(new Date(t));
}

/** A value's London calendar date as UTC milliseconds; NaN when unreadable. */
function dayMs(value) {
  return Date.parse(`${calendarDate(value)}T00:00:00Z`);
}

/**
 * Whole calendar days from `a` to `b` — 'YYYY-MM-DD' dates, or timestamps,
 * which count as their London calendar date (calendarDate). Negative when `b`
 * is earlier; NaN when either is unreadable.
 * Counted in UTC, so no clock change can make a day 23 or 25 hours long.
 * @param {string} a
 * @param {string} b
 */
export function daysBetween(a, b) {
  return Math.round((dayMs(b) - dayMs(a)) / DAY_MS);
}

// London wall-clock parts of an instant: y, m (1-12), d, h, mi, s.
const londonPartsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUILDING_TIME_ZONE, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function londonParts(date) {
  /** @type {Record<string, number>} */
  const p = {};
  for (const { type, value } of londonPartsFmt.formatToParts(date)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}
/** How far London is ahead of UTC at an instant, in ms (0 in winter, 1 h under BST). */
function londonOffsetMs(date) {
  const p = londonParts(date);
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return wall - (date.getTime() - date.getUTCMilliseconds());
}

/**
 * The instant `days` calendar days later at the same LONDON wall-clock time —
 * e.g. 09:00 on 20 Oct + 10 days is 09:00 on 30 Oct, though the clocks went
 * back in between and that is 241 hours, not 240.
 *
 * This is what a person in London means by "within 10 days", and it is the
 * same wherever the code runs. The MOR 10-day clock used local-calendar
 * arithmetic, which is London's in a London browser but UTC's on the server —
 * so the server's period summary and the app could disagree by an hour
 * across a clock change (2026-10-02).
 *
 * @param {Date|string} instant
 * @param {number} days
 * @returns {Date}
 */
export function addDaysLondon(instant, days) {
  const at = instant instanceof Date ? instant : new Date(instant);
  const p = londonParts(at);
  const wall = Date.UTC(p.y, p.m - 1, p.d + Number(days), p.h, p.mi, p.s, at.getUTCMilliseconds());
  // The offset at the TARGET decides the instant; one correction settles it.
  let t = wall - londonOffsetMs(at);
  t = wall - londonOffsetMs(new Date(t));
  return new Date(t);
}

/**
 * Add whole months to a 'YYYY-MM-DD', returning the same shape, in UTC.
 * A day that does not exist in the target month is clamped to its last day
 * (31 Jan + 1 month = 28/29 Feb), rather than overflowing into the next month
 * as JavaScript's setMonth does. null when unreadable.
 * @param {string} dateStr
 * @param {number} months  may be negative
 */
export function addMonthsISO(dateStr, months) {
  const t = dayMs(dateStr);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Number(months), 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d.getUTCDate(), last));
  return first.toISOString().slice(0, 10);
}

/**
 * Whole days from today (London) until `dateISO` — negative once it has passed.
 * @param {string} dateISO
 * @param {string} [from]  'YYYY-MM-DD'; defaults to today()
 */
export function daysUntil(dateISO, from = today()) {
  return daysBetween(from, dateISO);
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
 * Add days to a 'YYYY-MM-DD' string, returning the same shape. UTC throughout.
 *
 * ⚠ Use THIS for date-only arithmetic, never `toDateString(addDays(new
 * Date(s + 'T00:00:00'), n))`. That combination mixes clocks: `addDays` steps
 * in LOCAL time (`setDate`) while `toDateString` formats via `toISOString()`
 * in UTC. In any timezone ahead of UTC — Europe/London for ~7 months a year
 * under BST — local midnight is the previous day in UTC, so the round trip
 * comes back a day early, and stepping by 1 returns the SAME date forever.
 * That is an infinite loop, not an off-by-one: it hung the maintenance job
 * generator for any daily obligation (found by test, 2026-09-10).
 *
 * The Planner and Parking each had their own copy; both use this one now.
 *
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {number} days    may be negative
 * @returns {string|null}  'YYYY-MM-DD', or null if the input is unparseable
 */
export function addDaysISO(dateStr, days) {
  if (!dateStr) return null;
  const t = dayMs(dateStr);
  if (Number.isNaN(t)) return null;
  return new Date(t + Number(days) * DAY_MS).toISOString().slice(0, 10);
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
