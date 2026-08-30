// src/lib/apps/planner/utils/monthGrid.test.js

import { describe, it, expect } from 'vitest';
import { buildMonthGrid, mondayIndex, stepMonth, monthList, WEEKDAY_LABELS } from './monthGrid.js';

const occ = (date) => ({ date, status: 'due', series: { id: 'e1', title: 'Thing' } });

describe('mondayIndex', () => {
  it('puts Monday first, not Sunday', () => {
    // A British building's week ends at the weekend rather than having a piece
    // at each edge.
    expect(mondayIndex('2026-01-05')).toBe(0);   // Monday
    expect(mondayIndex('2026-01-10')).toBe(5);   // Saturday
    expect(mondayIndex('2026-01-11')).toBe(6);   // Sunday
  });
});

describe('buildMonthGrid', () => {
  it('labels the month', () => {
    expect(buildMonthGrid(2026, 3, []).label).toBe('March 2026');
  });

  it('is always six rows of seven', () => {
    // A month can span six weeks, and a grid that changes height as you page
    // makes everything below it jump.
    for (const month of [1, 2, 5, 8, 12]) {
      const grid = buildMonthGrid(2026, month, []);
      expect(grid.weeks).toHaveLength(6);
      expect(grid.weeks.every(w => w.length === 7)).toBe(true);
    }
  });

  it('starts on the Monday on or before the 1st', () => {
    // 1 March 2026 is a Sunday, so the grid opens on 23 February.
    expect(buildMonthGrid(2026, 3, []).weeks[0][0].date).toBe('2026-02-23');
  });

  it('marks days from the neighbouring months', () => {
    const grid = buildMonthGrid(2026, 3, []);
    expect(grid.weeks[0][0].outside).toBe(true);
    const firstOfMarch = grid.weeks[0].find(d => d.date === '2026-03-01');
    expect(firstOfMarch.outside).toBe(false);
  });

  it('marks the weekend as the last two columns', () => {
    const [week] = buildMonthGrid(2026, 3, []).weeks;
    expect(week.map(d => d.weekend)).toEqual([false, false, false, false, false, true, true]);
  });

  it('places occurrences on their day', () => {
    const grid = buildMonthGrid(2026, 3, [occ('2026-03-14'), occ('2026-03-14')]);
    const day = grid.weeks.flat().find(d => d.date === '2026-03-14');
    expect(day.items).toHaveLength(2);
  });

  it('shows an occurrence that falls in a neighbouring month, faintly', () => {
    // The last days of February are often exactly what somebody checking the
    // start of March wants to see.
    const grid = buildMonthGrid(2026, 3, [occ('2026-02-25')]);
    const day = grid.weeks.flat().find(d => d.date === '2026-02-25');
    expect(day.outside).toBe(true);
    expect(day.items).toHaveLength(1);
  });

  it('marks today', () => {
    const grid = buildMonthGrid(2026, 6, [], '2026-06-15');
    expect(grid.weeks.flat().find(d => d.date === '2026-06-15').today).toBe(true);
  });

  it('handles a month that starts on a Monday', () => {
    // 1 June 2026 is a Monday; there is nothing before it to fill in.
    const grid = buildMonthGrid(2026, 6, []);
    expect(grid.weeks[0][0].date).toBe('2026-06-01');
    expect(grid.weeks[0][0].outside).toBe(false);
  });
});

describe('stepMonth', () => {
  it('moves forward and back, across a year boundary', () => {
    expect(stepMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(stepMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(stepMonth(2026, 5, 2)).toEqual({ year: 2026, month: 7 });
  });

  it('stops at the edges of what has been computed', () => {
    // An empty month nothing was expanded for cannot be told from a quiet one.
    const window = { from: '2026-01-01', to: '2027-12-31' };
    expect(stepMonth(2027, 12, 1, window)).toBeNull();
    expect(stepMonth(2026, 1, -1, window)).toBeNull();
    expect(stepMonth(2026, 6, 1, window)).toEqual({ year: 2026, month: 7 });
  });
});

describe('monthList', () => {
  it('lists only what belongs to the month', () => {
    const grid = buildMonthGrid(2026, 3, [occ('2026-03-02'), occ('2026-02-25')]);
    expect(monthList(grid).map(i => i.date)).toEqual(['2026-03-02']);
  });
});

describe('WEEKDAY_LABELS', () => {
  it('runs Monday to Sunday', () => {
    expect(WEEKDAY_LABELS[0]).toBe('Mon');
    expect(WEEKDAY_LABELS[6]).toBe('Sun');
  });
});
