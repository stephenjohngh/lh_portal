// src/lib/apps/planner/utils/yearGrid.js
// The wallplanner layout — pure, Type-1 testable, no DOM.
//
// ── Columns are WEEKDAYS, not day numbers ──────────────────────────────────
// This is the shape a printed year planner has always had, and the first
// version of this file got it wrong: it put day 1..31 in fixed columns, which
// makes a tidy rectangle and tells you nothing. Nobody asks "what is on the
// 15th of every month"; they ask "which of these are weekends", "how does the
// last week of March run", "is that a Tuesday".
//
// So each row is a month, and every day sits in the column of its WEEKDAY:
//
//     MON TUE WED THU FRI SAT SUN MON TUE …
// JAN              1   2   3   4   5   6  …
// FEB                          1   2   3  …
//
// The result is that Saturdays and Sundays line up as vertical stripes down the
// whole year, which is the thing that makes one of these readable across twelve
// rows — and each month starts at its own offset, which is why the left edge is
// ragged and should be.
//
// A month can start on a Sunday (offset 6) and run 31 days, so 37 columns is
// the most any year needs, and every row gets 37 so the stripes stay straight.

import { daysInMonth, formatISO, weekdayOf } from './recurrence.js';

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Short labels for the row headers. */
export const MONTH_SHORT = MONTH_LABELS.map(m => m.slice(0, 3));

/** Monday first, the way a British week runs. */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Enough columns for the worst case: a 31-day month beginning on a Sunday.
 * Every row gets all of them so the weekend stripes run straight down the year.
 */
export const SLOTS = 37;

/** Monday = 0 … Sunday = 6, from JavaScript's Sunday-first numbering. */
export function mondayIndex(iso) {
  const day = weekdayOf(iso);
  return day === null ? null : (day + 6) % 7;
}

/** The weekday each column stands for, repeating across the width. */
export function columnWeekdays() {
  return Array.from({ length: SLOTS }, (_, i) => i % 7);
}

/**
 * One year, as rows of months laid out by weekday.
 *
 * @param {number} year
 * @param {object[]} occurrences  anything with a `.date`
 * @param {string} [today]
 * @returns {{ month: number, label: string, short: string, offset: number,
 *             slots: ({ day: number, date: string, weekday: number,
 *                       weekend: boolean, today: boolean, items: object[] }|null)[] }[]}
 */
export function buildYearGrid(year, occurrences = [], today = null) {
  const byDate = new Map();
  for (const item of occurrences) {
    if (!item?.date?.startsWith(String(year))) continue;
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  }

  return MONTH_LABELS.map((label, i) => {
    const month = i + 1;
    const length = daysInMonth(year, month);
    const offset = mondayIndex(formatISO(year, month, 1));

    const slots = Array.from({ length: SLOTS }, (_, slot) => {
      const day = slot - offset + 1;
      // Before the 1st, or after the month ends: an empty column, kept so the
      // weekday stripes stay straight.
      if (day < 1 || day > length) return null;

      const date = formatISO(year, month, day);
      const weekday = slot % 7;

      return {
        day,
        date,
        weekday,
        weekend: weekday >= 5,
        today: date === today,
        items: byDate.get(date) ?? [],
      };
    });

    return { month, label, short: MONTH_SHORT[i], offset, slots };
  });
}

/**
 * What a single cell has to say in very little space.
 *
 * Repeats are collapsed by category: three compliance items on one day should
 * read as "this day is busy with compliance", not as three identical marks.
 * `overflow` says how many kinds did not fit, so a crowded day is visibly
 * crowded rather than quietly truncated.
 */
export function cellMarks(items = [], limit = 3) {
  const seen = [];
  for (const item of items) {
    const category = item.series?.category ?? null;
    if (!seen.includes(category)) seen.push(category);
  }
  return {
    categories: seen.slice(0, limit),
    overflow: Math.max(0, seen.length - limit),
    count: items.length,
    outstanding: items.some(i => i.status === 'due'),
  };
}

/**
 * The years a reader can page to, given what has been expanded.
 *
 * Bounded by the window rather than open-ended: offering a year nothing has been
 * computed for would show an empty grid and no way to tell it from a quiet year.
 */
export function yearsInWindow(from, to) {
  const first = Number(String(from).slice(0, 4));
  const last  = Number(String(to).slice(0, 4));
  if (!first || !last || last < first) return [];
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** A month's occurrences, in date order. */
export function monthItems(grid, month) {
  const row = grid.find(m => m.month === month);
  if (!row) return [];
  return row.slots.filter(Boolean).flatMap(d => d.items);
}
