// src/lib/apps/planner/utils/yearGrid.test.js

import { describe, it, expect } from 'vitest';
import { buildYearGrid, cellMarks, yearsInWindow, monthItems, MONTH_SHORT } from './yearGrid.js';

const occ = (date, category = 'compliance', status = 'due') => ({
  date, status, series: { id: 'e1', title: 'Thing', category },
});

describe('buildYearGrid', () => {
  it('gives twelve months', () => {
    const grid = buildYearGrid(2026, []);
    expect(grid).toHaveLength(12);
    expect(grid[0].label).toBe('January');
    expect(grid[11].short).toBe('Dec');
  });

  it('gives every month 31 cells, so the columns line up', () => {
    // A ragged grid cannot be a grid: "the 15th" has to be a vertical line down
    // the year, which is most of what a wallplanner is for.
    const grid = buildYearGrid(2026, []);
    expect(grid.every(m => m.days.length === 31)).toBe(true);
  });

  it('returns null for days a month does not have', () => {
    const grid = buildYearGrid(2026, []);
    const february = grid[1];
    expect(february.days[27]).not.toBeNull();     // the 28th
    expect(february.days[28]).toBeNull();         // no 29th in 2026
    expect(grid[3].days[30]).toBeNull();          // no 31st of April
  });

  it('knows a leap year', () => {
    expect(buildYearGrid(2028, [])[1].days[28]).not.toBeNull();
  });

  it('places occurrences on their day', () => {
    const grid = buildYearGrid(2026, [occ('2026-03-14'), occ('2026-03-14'), occ('2026-07-01')]);
    expect(grid[2].days[13].items).toHaveLength(2);
    expect(grid[6].days[0].items).toHaveLength(1);
    expect(grid[0].days[0].items).toEqual([]);
  });

  it('ignores occurrences from another year', () => {
    const grid = buildYearGrid(2026, [occ('2027-03-14'), occ('2025-03-14')]);
    expect(grid.flatMap(m => m.days.filter(Boolean).flatMap(d => d.items))).toEqual([]);
  });

  it('marks weekends', () => {
    // 3 January 2026 is a Saturday.
    const grid = buildYearGrid(2026, []);
    expect(grid[0].days[2].weekend).toBe(true);
    expect(grid[0].days[3].weekend).toBe(true);   // Sunday the 4th
    expect(grid[0].days[4].weekend).toBe(false);
  });

  it('marks today, when told what it is', () => {
    const grid = buildYearGrid(2026, [], '2026-06-15');
    expect(grid[5].days[14].today).toBe(true);
    expect(grid[5].days[13].today).toBe(false);
  });

  it('survives an empty year and bad input', () => {
    expect(buildYearGrid(2026, []).every(m => m.days.filter(Boolean)
      .every(d => d.items.length === 0))).toBe(true);
    expect(() => buildYearGrid(2026, [{ }])).not.toThrow();
  });
});

describe('cellMarks', () => {
  it('collapses repeats of one category', () => {
    // Three compliance items should read as "busy with compliance", not as
    // three identical marks in a cell six pixels wide.
    const marks = cellMarks([occ('2026-01-01'), occ('2026-01-01'), occ('2026-01-01')]);
    expect(marks.categories).toEqual(['compliance']);
    expect(marks.count).toBe(3);
  });

  it('keeps distinct categories, in the order they appear', () => {
    const marks = cellMarks([
      occ('2026-01-01', 'meeting'), occ('2026-01-01', 'compliance'),
    ]);
    expect(marks.categories).toEqual(['meeting', 'compliance']);
  });

  it('says how many kinds did not fit', () => {
    const marks = cellMarks([
      occ('2026-01-01', 'a'), occ('2026-01-01', 'b'),
      occ('2026-01-01', 'c'), occ('2026-01-01', 'd'),
    ], 3);
    expect(marks.categories).toHaveLength(3);
    expect(marks.overflow).toBe(1);
  });

  it('distinguishes a day with something outstanding from a day that is done', () => {
    expect(cellMarks([occ('2026-01-01', 'x', 'due')]).outstanding).toBe(true);
    expect(cellMarks([occ('2026-01-01', 'x', 'done')]).outstanding).toBe(false);
  });

  it('survives an empty day', () => {
    expect(cellMarks([])).toMatchObject({ categories: [], overflow: 0, count: 0 });
  });
});

describe('yearsInWindow', () => {
  it('offers only years that have been expanded', () => {
    // Offering 2043 when nothing is computed past 2028 gives an empty grid and
    // no way to tell an empty year from an unloaded one.
    expect(yearsInWindow('2025-06-15', '2028-06-15')).toEqual([2025, 2026, 2027, 2028]);
  });

  it('handles a window inside one year', () => {
    expect(yearsInWindow('2026-01-01', '2026-12-31')).toEqual([2026]);
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

describe('MONTH_SHORT', () => {
  it('is three letters, twelve times', () => {
    expect(MONTH_SHORT).toHaveLength(12);
    expect(MONTH_SHORT.every(m => m.length === 3)).toBe(true);
  });
});
