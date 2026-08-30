// src/lib/apps/planner/utils/recurrence.test.js

import { describe, it, expect } from 'vitest';
import {
  expandRule, expandSeries, describeRule, clampDay, nthWeekdayOf,
  daysInMonth, weekdayOf, addDaysISO, daysBetween, ordinal, MAX_OCCURRENCES,
} from './recurrence.js';

const YEAR = ['2026-01-01', '2026-12-31'];

describe('date arithmetic', () => {
  it('knows the length of a month, leap years included', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 6)).toBe(30);
  });

  it('adds days across a month and a year boundary', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days between dates, in both directions', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30);
  });

  it('reads a weekday', () => {
    expect(weekdayOf('2026-01-01')).toBe(4);   // a Thursday
  });
});

describe('clampDay', () => {
  it('keeps a day that exists', () => {
    expect(clampDay(2026, 3, 15)).toBe(15);
  });

  it('CLAMPS to the end of a short month rather than skipping it', () => {
    // iCal would simply not produce a 31st in June. That is right for a
    // protocol and wrong for a planner: "meter readings on the 31st" means the
    // end of the month, and dropping four months would misstate the year.
    expect(clampDay(2026, 6, 31)).toBe(30);
    expect(clampDay(2026, 2, 31)).toBe(28);
    expect(clampDay(2028, 2, 29)).toBe(29);
  });

  it('takes -1 as the last day outright', () => {
    expect(clampDay(2026, 2, -1)).toBe(28);
    expect(clampDay(2026, 7, -1)).toBe(31);
  });
});

describe('nthWeekdayOf', () => {
  it('finds the first Tuesday', () => {
    expect(nthWeekdayOf(2026, 3, 2, 1)).toBe('2026-03-03');
  });

  it('finds the last Friday', () => {
    expect(nthWeekdayOf(2026, 3, 5, -1)).toBe('2026-03-27');
  });

  it('returns nothing where there is no fifth one', () => {
    // Inventing one would put the directors' meeting in the following month.
    const fifthTuesdays = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      .map(m => nthWeekdayOf(2026, m, 2, 5));
    expect(fifthTuesdays.some(d => d === null)).toBe(true);
  });
});

describe('expandRule — the patterns a building actually uses', () => {
  it('once is once', () => {
    expect(expandRule({ freq: 'once' }, '2026-05-06', ...YEAR)).toEqual(['2026-05-06']);
  });

  it('daily, every N days', () => {
    expect(expandRule({ freq: 'daily', interval: 10 }, '2026-01-01', '2026-01-01', '2026-02-01'))
      .toEqual(['2026-01-01', '2026-01-11', '2026-01-21', '2026-01-31']);
  });

  it('weekly on chosen days', () => {
    // Mondays and Thursdays in the first fortnight.
    expect(expandRule({ freq: 'weekly', weekdays: [1, 4] }, '2026-01-01', '2026-01-01', '2026-01-14'))
      .toEqual(['2026-01-01', '2026-01-05', '2026-01-08', '2026-01-12']);
  });

  it('weekly with no days named follows the start date', () => {
    expect(expandRule({ freq: 'weekly' }, '2026-01-07', '2026-01-01', '2026-01-31'))
      .toEqual(['2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28']);
  });

  it('fortnightly skips a week', () => {
    expect(expandRule({ freq: 'weekly', interval: 2 }, '2026-01-07', '2026-01-01', '2026-02-28'))
      .toEqual(['2026-01-07', '2026-01-21', '2026-02-04', '2026-02-18']);
  });

  it('monthly on a date — meter readings on the 1st', () => {
    const out = expandRule({ freq: 'monthly', monthDay: 1 }, '2026-01-01', ...YEAR);
    expect(out).toHaveLength(12);
    expect(out[0]).toBe('2026-01-01');
    expect(out[11]).toBe('2026-12-01');
  });

  it('monthly on the 31st lands on the last day of short months', () => {
    const out = expandRule({ freq: 'monthly', monthDay: 31 }, '2026-01-31', '2026-01-01', '2026-04-30');
    expect(out).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('monthly on an nth weekday — directors, first Tuesday', () => {
    const out = expandRule({ freq: 'monthly', nth: 1, weekday: 2 }, '2026-01-01', ...YEAR);
    expect(out[0]).toBe('2026-01-06');
    expect(out[1]).toBe('2026-02-03');
    expect(out).toHaveLength(12);
  });

  it('quarterly steps three months from where it starts', () => {
    expect(expandRule({ freq: 'monthly', interval: 3, monthDay: 25 }, '2026-03-25', ...YEAR))
      .toEqual(['2026-03-25', '2026-06-25', '2026-09-25', '2026-12-25']);
  });

  it('yearly in a named month — the AGM each November', () => {
    const out = expandRule({ freq: 'yearly', month: 11, monthDay: 14 },
      '2026-01-01', '2026-01-01', '2029-12-31');
    expect(out).toEqual(['2026-11-14', '2027-11-14', '2028-11-14', '2029-11-14']);
  });

  it('yearly on the 29th of February clamps in ordinary years', () => {
    const out = expandRule({ freq: 'yearly', month: 2, monthDay: 29 },
      '2028-02-29', '2028-01-01', '2030-12-31');
    expect(out).toEqual(['2028-02-29', '2029-02-28', '2030-02-28']);
  });

  it('every five years — the fixed wiring inspection', () => {
    expect(expandRule({ freq: 'yearly', interval: 5, month: 6, monthDay: 1 },
      '2026-06-01', '2026-01-01', '2040-12-31'))
      .toEqual(['2026-06-01', '2031-06-01', '2036-06-01']);
  });

  it('stops at `until`', () => {
    expect(expandRule({ freq: 'monthly', monthDay: 1, until: '2026-03-31' }, '2026-01-01', ...YEAR))
      .toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('stops after `count`, counted from the START and not from the window', () => {
    // Otherwise paging to next year hands the series a fresh allowance.
    expect(expandRule({ freq: 'monthly', monthDay: 1, count: 3 }, '2026-01-01', ...YEAR))
      .toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(expandRule({ freq: 'monthly', monthDay: 1, count: 3 },
      '2026-01-01', '2026-04-01', '2026-12-31')).toEqual([]);
  });

  it('returns nothing before the series begins', () => {
    expect(expandRule({ freq: 'monthly', monthDay: 1 }, '2026-06-01', '2026-01-01', '2026-05-31'))
      .toEqual([]);
  });

  it('is bounded, whatever it is asked for', () => {
    const out = expandRule({ freq: 'daily' }, '2026-01-01', '2026-01-01', '2099-12-31');
    expect(out.length).toBeLessThanOrEqual(MAX_OCCURRENCES);
  });

  it('survives nonsense', () => {
    expect(expandRule(null, '2026-01-01', ...YEAR)).toEqual([]);
    expect(expandRule({ freq: 'monthly' }, 'not-a-date', ...YEAR)).toEqual([]);
  });
});

describe('expandSeries — anchored vs drifting', () => {
  const rule = { freq: 'yearly', month: 3, monthDay: 1 };

  it('anchored ignores when it was last done', () => {
    // The AGM is in March whether or not last year ran late.
    const series = { start_date: '2026-03-01', recurrence: rule, drifts: false };
    expect(expandSeries(series, '2026-05-20', '2027-01-01', '2027-12-31'))
      .toEqual(['2027-03-01']);
  });

  it('drifting counts from the completion', () => {
    // Serviced in May, so the next one is the following May.
    const series = { start_date: '2026-03-01', recurrence: rule, drifts: true };
    expect(expandSeries(series, '2026-05-20', '2026-01-01', '2027-12-31'))
      .toEqual(['2027-05-20']);
  });

  it('IGNORES an absolute month once it drifts', () => {
    // "Every year in March" and "twelve months after it was last done" are
    // contradictory. Once a series drifts, only the interval survives —
    // otherwise a boiler serviced in May is still due the following March,
    // which is what the first version did.
    const series = { start_date: '2026-03-01', recurrence: rule, drifts: true };
    expect(expandSeries(series, '2026-05-20', '2026-01-01', '2027-12-31'))
      .not.toContain('2027-03-01');
  });

  it('drifting behaves as anchored until it has been done once', () => {
    const series = { start_date: '2026-03-01', recurrence: rule, drifts: true };
    expect(expandSeries(series, null, '2026-01-01', '2026-12-31'))
      .toEqual(['2026-03-01']);
  });

  it('never re-offers the completion itself', () => {
    const series = {
      start_date: '2026-01-01',
      recurrence: { freq: 'monthly', monthDay: 15 },
      drifts: true,
    };
    const out = expandSeries(series, '2026-03-15', '2026-01-01', '2026-06-30');
    expect(out).not.toContain('2026-03-15');
    expect(out[0]).toBe('2026-04-15');
  });

  it('survives a series with nothing set', () => {
    expect(expandSeries(null, null, ...YEAR)).toEqual([]);
    expect(expandSeries({ start_date: '2026-01-01' }, null, ...YEAR)).toEqual(['2026-01-01']);
  });
});

describe('describeRule', () => {
  it('says what a rule does, in words a person can check', () => {
    expect(describeRule({ freq: 'once' })).toBe('Once');
    expect(describeRule({ freq: 'daily' })).toBe('Every day');
    expect(describeRule({ freq: 'weekly', interval: 2, weekdays: [1] }))
      .toBe('Every 2 weeks on Monday');
    expect(describeRule({ freq: 'monthly', nth: 1, weekday: 2 }))
      .toBe('Every month on the first Tuesday');
    expect(describeRule({ freq: 'monthly', monthDay: -1 }))
      .toBe('Every month on the last day');
    expect(describeRule({ freq: 'yearly', month: 11, monthDay: 14 }))
      .toBe('Every year in November, on the 14th');
  });

  it('says when a series counts from the last completion', () => {
    // Nobody would guess this from a date, and the two behave differently.
    const text = describeRule({ freq: 'yearly', month: 3, monthDay: 1 }, { drifts: true });
    expect(text).toContain('counted from when it was last done');
    // And does NOT claim a month it will not honour.
    expect(text).not.toContain('March');
  });

  it('mentions an end', () => {
    expect(describeRule({ freq: 'daily', count: 5 })).toContain('5 times');
    expect(describeRule({ freq: 'daily', until: '2026-06-30' })).toContain('until 2026-06-30');
  });
});

describe('ordinal', () => {
  it('handles the awkward ones', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(-1)).toBe('last day');
  });
});
