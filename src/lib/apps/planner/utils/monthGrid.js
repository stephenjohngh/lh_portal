// src/lib/apps/planner/utils/monthGrid.js
// One month as weeks — pure, Type-1 testable, no DOM.
//
// The year grid answers "what does this year look like" in dots. A month has
// room for words, which is the whole reason to have both: the year is for
// shape, the month is for reading.
//
// Weeks run Monday to Sunday. That is how a British building's week runs — the
// weekend is the end of it, not a piece at each edge — and it puts Saturday and
// Sunday together where a caretaker looks for them.

import { daysInMonth, formatISO, weekdayOf, addDaysISO } from './recurrence.js';
import { MONTH_LABELS } from './yearGrid.js';

/** Monday first, matching the grid below. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday = 0 … Sunday = 6, from JavaScript's Sunday-first numbering. */
export function mondayIndex(iso) {
  const day = weekdayOf(iso);
  return day === null ? null : (day + 6) % 7;
}

/**
 * A month as rows of seven days.
 *
 * Days from the neighbouring months fill the corners rather than being left
 * blank, marked `outside` so they can be drawn faintly. A calendar with holes
 * at its corners is harder to read across, and the last days of the previous
 * month are often exactly what somebody checking the start of this one wants.
 *
 * @param {number} year
 * @param {number} month  1-12
 * @param {object[]} occurrences
 * @param {string} [today]
 * @returns {{ label: string, weeks: object[][] }}
 */
export function buildMonthGrid(year, month, occurrences = [], today = null) {
  const byDate = new Map();
  for (const item of occurrences) {
    if (!item?.date) continue;
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  }

  const first = formatISO(year, month, 1);
  const start = addDaysISO(first, -mondayIndex(first));   // the Monday on or before the 1st
  const length = daysInMonth(year, month);

  // Six rows always. A month can span six weeks, and a grid that changes height
  // as you page through the year makes everything below it jump.
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = addDaysISO(start, w * 7 + d);
      const inMonth = date >= first && date <= formatISO(year, month, length);

      days.push({
        date,
        day: Number(date.slice(8, 10)),
        outside: !inMonth,
        weekend: d >= 5,
        today: date === today,
        items: byDate.get(date) ?? [],
      });
    }
    weeks.push(days);
  }

  return { label: `${MONTH_LABELS[month - 1]} ${year}`, weeks };
}

/**
 * Where a month sits in the rolling window, so paging can stop at its edges.
 *
 * Offering January of a year nothing has been computed for would show an empty
 * month with no way to tell it from a quiet one.
 */
export function stepMonth(year, month, step, { from, to } = {}) {
  const index = (year * 12 + (month - 1)) + step;
  const next = { year: Math.floor(index / 12), month: (index % 12) + 1 };

  const first = formatISO(next.year, next.month, 1);
  if (from && first < from.slice(0, 8) + '01') return null;
  if (to && first > to) return null;

  return next;
}

/** Everything in the month, in date then time order — for a print or a list. */
export function monthList(grid) {
  return grid.weeks
    .flat()
    .filter(d => !d.outside)
    .flatMap(d => d.items);
}
