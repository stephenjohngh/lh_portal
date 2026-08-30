// src/lib/apps/planner/utils/yearGrid.test.js

import { describe, it, expect } from 'vitest';
import {
  buildYearGrid, cellMarks, yearsInWindow, monthItems, mondayIndex,
  columnWeekdays, MONTH_SHORT, WEEKDAY_SHORT, SLOTS,
} from './yearGrid.js';

const occ = (date, category = 'compliance', status = 'due') => ({
  date, status, series: { id: 'e1', title: 'Thing', category },
});

/** Where a date sits in a month's row. */
const slotOf = (grid, month, date) =>
  grid[month - 1].slots.findIndex(s => s?.date === date);

describe('mondayIndex', () => {
  it('runs Monday to Sunday, not Sunday first', () => {
    expect(mondayIndex('2026-01-05')).toBe(0);   // Monday
    expect(mondayIndex('2026-01-10')).toBe(5);   // Saturday
    expect(mondayIndex('2026-01-11')).toBe(6);   // Sunday
  });
});

describe('buildYearGrid — laid out by weekday', () => {
  it('gives twelve months', () => {
    const grid = buildYearGrid(2026, []);
    expect(grid).toHaveLength(12);
    expect(grid[0].label).toBe('January');
    expect(grid[11].short).toBe('Dec');
  });

  it('gives every month the same number of columns', () => {
    // The weekend stripes only run straight down the year if every row has the
    // full width, whatever the month's own shape.
    const grid = buildYearGrid(2026, []);
    expect(grid.every(m => m.slots.length === SLOTS)).toBe(true);
  });

  it('starts each month at the column of its OWN first weekday', () => {
    // This is the whole point of the layout, and the ragged left edge is the
    // evidence it is working. 1 January 2026 is a Thursday; 1 February a Sunday.
    const grid = buildYearGrid(2026, []);
    expect(grid[0].offset).toBe(3);              // Thu
    expect(grid[0].slots[3].day).toBe(1);
    expect(grid[0].slots[2]).toBeNull();

    expect(grid[1].offset).toBe(6);              // Sun
    expect(grid[1].slots[6].day).toBe(1);
  });

  it('puts every day of a month in a weekday column that matches its date', () => {
    const grid = buildYearGrid(2026, []);
    for (const month of grid) {
      for (const slot of month.slots.filter(Boolean)) {
        expect(slot.weekday).toBe(mondayIndex(slot.date));
      }
    }
  });

  it('lines Saturdays and Sundays up as vertical stripes', () => {
    // The reason the layout is worth having: one column is a weekend for every
    // month at once.
    const grid = buildYearGrid(2026, []);
    for (const column of [5, 6, 12, 13]) {
      const days = grid.map(m => m.slots[column]).filter(Boolean);
      expect(days.every(d => d.weekend)).toBe(true);
    }
    for (const column of [0, 7, 14]) {
      const days = grid.map(m => m.slots[column]).filter(Boolean);
      expect(days.every(d => !d.weekend)).toBe(true);
    }
  });

  it('is wide enough for the worst month', () => {
    // A 31-day month beginning on a Sunday needs 6 + 31 columns exactly.
    const grid = buildYearGrid(2026, []);
    const widest = Math.max(...grid.map(m => m.offset + m.slots.filter(Boolean).length));
    expect(widest).toBeLessThanOrEqual(SLOTS);
  });

  it('ends each month after its last day', () => {
    const grid = buildYearGrid(2026, []);
    const february = grid[1];
    expect(february.slots.filter(Boolean)).toHaveLength(28);
    expect(buildYearGrid(2028, [])[1].slots.filter(Boolean)).toHaveLength(29);
    expect(grid[3].slots.filter(Boolean)).toHaveLength(30);   // April
  });

  it('places occurrences on their day', () => {
    const grid = buildYearGrid(2026, [occ('2026-03-14'), occ('2026-03-14'), occ('2026-07-01')]);
    expect(grid[2].slots[slotOf(grid, 3, '2026-03-14')].items).toHaveLength(2);
    expect(grid[6].slots[slotOf(grid, 7, '2026-07-01')].items).toHaveLength(1);
  });

  it('ignores occurrences from another year', () => {
    const grid = buildYearGrid(2026, [occ('2027-03-14'), occ('2025-03-14')]);
    expect(grid.flatMap(m => m.slots.filter(Boolean).flatMap(d => d.items))).toEqual([]);
  });

  it('marks today', () => {
    const grid = buildYearGrid(2026, [], '2026-06-15');
    expect(grid[5].slots[slotOf(grid, 6, '2026-06-15')].today).toBe(true);
  });

  it('survives an empty year and bad input', () => {
    expect(buildYearGrid(2026, []).every(m => m.slots.filter(Boolean)
      .every(d => d.items.length === 0))).toBe(true);
    expect(() => buildYearGrid(2026, [{ }])).not.toThrow();
  });
});

describe('columnWeekdays', () => {
  it('repeats Monday to Sunday across the width', () => {
    const columns = columnWeekdays();
    expect(columns).toHaveLength(SLOTS);
    expect(columns.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('cellMarks', () => {
  it('collapses repeats of one category', () => {
    const marks = cellMarks([occ('2026-01-01'), occ('2026-01-01'), occ('2026-01-01')]);
    expect(marks.categories).toEqual(['compliance']);
    expect(marks.count).toBe(3);
  });

  it('keeps distinct categories, in the order they appear', () => {
    expect(cellMarks([occ('2026-01-01', 'meeting'), occ('2026-01-01', 'compliance')]).categories)
      .toEqual(['meeting', 'compliance']);
  });

  it('says how many kinds did not fit', () => {
    const marks = cellMarks([
      occ('2026-01-01', 'a'), occ('2026-01-01', 'b'),
      occ('2026-01-01', 'c'), occ('2026-01-01', 'd'),
    ], 3);
    expect(marks.categories).toHaveLength(3);
    expect(marks.overflow).toBe(1);
  });

  it('distinguishes a day with something outstanding from one that is done', () => {
    expect(cellMarks([occ('2026-01-01', 'x', 'due')]).outstanding).toBe(true);
    expect(cellMarks([occ('2026-01-01', 'x', 'done')]).outstanding).toBe(false);
  });

  it('survives an empty day', () => {
    expect(cellMarks([])).toMatchObject({ categories: [], overflow: 0, count: 0 });
  });
});

describe('yearsInWindow', () => {
  it('offers only years that have been expanded', () => {
    expect(yearsInWindow('2025-06-15', '2028-06-15')).toEqual([2025, 2026, 2027, 2028]);
  });

  it('survives nonsense', () => {
    expect(yearsInWindow(null, null)).toEqual([]);
    expect(yearsInWindow('2028-01-01', '2026-01-01')).toEqual([]);
  });
});

describe('monthItems', () => {
  it('flattens one month in day order', () => {
    const grid = buildYearGrid(2026, [occ('2026-03-20'), occ('2026-03-02'), occ('2026-04-01')]);
    expect(monthItems(grid, 3).map(i => i.date)).toEqual(['2026-03-02', '2026-03-20']);
  });

  it('is empty for a month with nothing, and for a month that is not there', () => {
    expect(monthItems(buildYearGrid(2026, []), 5)).toEqual([]);
    expect(monthItems(buildYearGrid(2026, []), 13)).toEqual([]);
  });
});

describe('labels', () => {
  it('are three letters each', () => {
    expect(MONTH_SHORT).toHaveLength(12);
    expect(WEEKDAY_SHORT).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });
});
