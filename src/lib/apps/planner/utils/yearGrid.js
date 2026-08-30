// src/lib/apps/planner/utils/yearGrid.js
// The wallplanner layout — pure, Type-1 testable, no DOM.
//
// Twelve rows of months, thirty-one day columns. That is the shape of the paper
// thing this replaces, and it is the shape that fits a landscape screen and a
// landscape sheet of paper. The alternative — months as columns — is taller
// than any screen and needs scrolling, which defeats seeing a year at once.
//
// Every row has 31 cells whether or not the month has 31 days. A ragged grid
// cannot be a grid: the columns have to line up so that "the 15th" is a
// vertical line down the year, which is most of what a wallplanner is for. The
// cells that do not exist are returned as null and drawn as blanks.

import { daysInMonth, formatISO, weekdayOf } from './recurrence.js';

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Short labels for the grid itself, where there is no room for the rest. */
export const MONTH_SHORT = MONTH_LABELS.map(m => m.slice(0, 3));

/**
 * One year, as rows of months and columns of days.
 *
 * @param {number} year
 * @param {object[]} occurrences  from buildOccurrences — anything with `.date`
 * @param {string} [today]        marked, so the reader can find themselves
 * @returns {{ month: number, label: string, short: string,
 *             days: ({ day: number, date: string, weekday: number,
 *                      weekend: boolean, today: boolean, items: object[] }|null)[] }[]}
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

    const days = Array.from({ length: 31 }, (_, d) => {
      const day = d + 1;
      if (day > length) return null;          // February's 30th does not exist

      const date = formatISO(year, month, day);
      const weekday = weekdayOf(date);

      return {
        day,
        date,
        weekday,
        weekend: weekday === 0 || weekday === 6,
        today: date === today,
        items: byDate.get(date) ?? [],
      };
    });

    return { month, label, short: MONTH_SHORT[i], days };
  });
}

/**
 * What a single cell has to say in the space of a few pixels.
 *
 * A cell shows category dots, not text — at this size text is a smear. Repeats
 * are collapsed, because three compliance items on one day should read as "this
 * day is busy with compliance", not as three identical marks.
 *
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
    // A day with anything outstanding reads differently from a day that is
    // done, and at this size that is the only distinction worth drawing.
    outstanding: items.some(i => i.status === 'due'),
  };
}

/**
 * The years a reader can page to, given what has been expanded.
 *
 * Bounded by the window rather than open-ended: offering 2043 when nothing has
 * been computed past 2028 would give an empty grid and no way to tell an empty
 * year from an unloaded one.
 */
export function yearsInWindow(from, to) {
  const first = Number(String(from).slice(0, 4));
  const last  = Number(String(to).slice(0, 4));
  if (!first || !last || last < first) return [];
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/**
 * A month's occurrences, in date then time order — what the month list shows
 * beside the grid.
 */
export function monthItems(grid, month) {
  const row = grid.find(m => m.month === month);
  if (!row) return [];
  return row.days.filter(Boolean).flatMap(d => d.items);
}
