// src/lib/utils/dates.test.js
// All assertions use 12:00 UTC timestamps (or shape-only checks for
// local-time output) so they pass in any CI/dev timezone within ±11h.
import { describe, it, expect } from 'vitest';
import {
  fmtDate, fmtDateLong, fmtTime, fmtDateTime, fmtDuration,
  isOverdue, wasModified, fmtShortDate, fmtDateOnly,
  toDateString, addDays, addDaysISO, fmtMonthYearCompact,
  today, calendarDate, daysBetween, daysUntil, addMonthsISO, addDaysLondon, fmtGenerated,
} from './dates.js';

const NOON = '2026-02-23T12:00:00Z';

describe('fmtDate', () => {
  it('formats as "DD Mon YYYY" in en-GB', () => {
    expect(fmtDate(NOON)).toBe('23 Feb 2026');
  });
  it('appends the user name in parentheses', () => {
    expect(fmtDate(NOON, 'Stephen')).toBe('23 Feb 2026 (Stephen)');
  });
  it('returns an em dash for null/empty', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('')).toBe('—');
  });
});

describe('fmtDateLong', () => {
  it('uses the full month name', () => {
    expect(fmtDateLong(NOON)).toBe('23 February 2026');
  });
  it('returns an em dash for null', () => {
    expect(fmtDateLong(null)).toBe('—');
  });
});

describe('fmtTime', () => {
  it('returns HH:MM', () => {
    expect(fmtTime(NOON)).toMatch(/^\d{2}:\d{2}$/);
  });
  it('returns empty string for null', () => {
    expect(fmtTime(null)).toBe('');
  });
});

describe('fmtDateTime', () => {
  it('combines date and time with optional name suffix', () => {
    expect(fmtDateTime(NOON)).toMatch(/^23 Feb 2026 \d{2}:\d{2}$/);
    expect(fmtDateTime(NOON, 'Ana')).toMatch(/^23 Feb 2026 \d{2}:\d{2} \(Ana\)$/);
  });
});

describe('fmtDuration', () => {
  it('formats sub-hour durations in minutes', () => {
    expect(fmtDuration('2026-02-23T10:00:00Z', '2026-02-23T10:15:00Z')).toBe('15 min');
  });
  it('formats >= 1h as Xh Ym', () => {
    expect(fmtDuration('2026-02-23T10:00:00Z', '2026-02-23T11:30:00Z')).toBe('1h 30m');
  });
  it('returns "Open" when there is no end time', () => {
    expect(fmtDuration('2026-02-23T10:00:00Z', null)).toBe('Open');
  });
});

describe('isOverdue', () => {
  it('is true for yesterday, false for tomorrow', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(isOverdue(new Date(Date.now() - day).toISOString())).toBe(true);
    expect(isOverdue(new Date(Date.now() + day).toISOString())).toBe(false);
  });
  it('is false for today and for null', () => {
    expect(isOverdue(new Date().toISOString())).toBe(false);
    expect(isOverdue(null)).toBe(false);
  });
});

describe('wasModified', () => {
  it('ignores differences within one second', () => {
    expect(wasModified('2026-02-23T10:00:00Z', '2026-02-23T10:00:00.900Z')).toBe(false);
  });
  it('detects later modification', () => {
    expect(wasModified('2026-02-23T10:00:00Z', '2026-02-23T10:00:02Z')).toBe(true);
  });
  it('is false when either side is missing', () => {
    expect(wasModified(null, NOON)).toBe(false);
    expect(wasModified(NOON, null)).toBe(false);
  });
});

describe('fmtShortDate', () => {
  it('renders single-digit days without a leading zero', () => {
    expect(fmtShortDate('2026-02-05T12:00:00Z')).toBe('5 Feb 2026');
  });
});

describe('fmtDateOnly', () => {
  it('treats a YYYY-MM-DD date column value as local midnight', () => {
    expect(fmtDateOnly('2026-02-23')).toBe('23 Feb 2026');
  });
  it('returns an em dash for null', () => {
    expect(fmtDateOnly(null)).toBe('—');
  });
});

describe('toDateString / addDays', () => {
  it('formats as YYYY-MM-DD (UTC)', () => {
    expect(toDateString('2026-02-23T12:34:56Z')).toBe('2026-02-23');
  });
  it('addDays crosses month boundaries', () => {
    expect(toDateString(addDays('2026-02-27T12:00:00Z', 3))).toBe('2026-03-02');
  });
});

describe('fmtMonthYearCompact', () => {
  it('produces short month + 2-digit year with no separator', () => {
    expect(fmtMonthYearCompact(new Date(2026, 3, 15))).toBe('Apr26');
  });
});

// addDaysISO — UTC-only date arithmetic.
//
// These are regression tests for a real bug, not hypotheticals. The previous
// idiom, toDateString(addDays(new Date(s + 'T00:00:00'), n)), mixed clocks:
// addDays steps in LOCAL time, toDateString formats in UTC. Under BST (~7
// months a year in Europe/London) local midnight is the previous day in UTC,
// so a +1 step returned the SAME string — an infinite loop in the maintenance
// job generator for any daily obligation, and a silent day-early result for
// every other cadence.
describe('addDaysISO', () => {
  it('advances a plain date', () => {
    expect(addDaysISO('2026-01-01', 1)).toBe('2026-01-02');
    expect(addDaysISO('2026-01-01', 30)).toBe('2026-01-31');
  });

  it('goes backwards with a negative step', () => {
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('crosses month and year boundaries', () => {
    expect(addDaysISO('2026-02-27', 3)).toBe('2026-03-02');   // non-leap year
    expect(addDaysISO('2024-02-27', 3)).toBe('2024-03-01');   // leap year
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });

  // The bug. Every one of these returned the input date under the old idiom.
  it('ALWAYS advances across a DST boundary and throughout BST', () => {
    for (const d of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-06-15',
                     '2026-10-24', '2026-10-25', '2026-10-26']) {
      expect(addDaysISO(d, 1)).not.toBe(d);
    }
    expect(addDaysISO('2026-03-29', 1)).toBe('2026-03-30');   // spring forward
    expect(addDaysISO('2026-10-25', 1)).toBe('2026-10-26');   // fall back
  });

  it('stays exact over a long BST run — 365 single-day steps land a year on', () => {
    let d = '2026-03-01';
    for (let i = 0; i < 365; i++) d = addDaysISO(d, 1);
    expect(d).toBe('2027-03-01');
  });

  it('tolerates a full timestamp by taking its date part', () => {
    expect(addDaysISO('2026-01-01T23:30:00Z', 1)).toBe('2026-01-02');
  });

  it('returns null for unusable input rather than an Invalid Date string', () => {
    expect(addDaysISO(null, 1)).toBeNull();
    expect(addDaysISO('', 1)).toBeNull();
    expect(addDaysISO('not-a-date', 1)).toBeNull();
  });
});

// ── Calendar days, in London (2026-10-02) ──────────────────────────────────
// The building is in England, so "today" is the London calendar date wherever
// the code runs. It used to be the UTC date, which under BST is YESTERDAY
// between midnight and 1 am.
describe('today (London)', () => {
  it('is the London date in the first hour of a BST day, not the UTC one', () => {
    // 00:30 on 2 Oct in London is 23:30 on 1 Oct in UTC.
    expect(today(new Date('2026-10-01T23:30:00Z'))).toBe('2026-10-02');
  });

  it('matches UTC in winter, when London is on GMT', () => {
    expect(today(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-01');
    expect(today(new Date('2026-12-02T00:30:00Z'))).toBe('2026-12-02');
  });

  it('is shaped YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('calendarDate', () => {
  it('leaves a plain date alone — it is already a calendar date', () => {
    expect(calendarDate('2026-03-29')).toBe('2026-03-29');
  });
  it('gives a timestamp its London date, not the first ten characters', () => {
    expect(calendarDate('2026-07-01T23:30:00Z')).toBe('2026-07-02');
    expect(calendarDate(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
  });
  it('is empty when unreadable', () => {
    expect(calendarDate('not a date')).toBe('');
    expect(calendarDate(null)).toBe('');
    expect(calendarDate(new Date('x'))).toBe('');
  });
});

describe('daysBetween / daysUntil', () => {
  it('counts whole calendar days, either way', () => {
    expect(daysBetween('2026-06-29', '2026-06-29')).toBe(0);
    expect(daysBetween('2026-06-29', '2026-07-09')).toBe(10);
    expect(daysBetween('2026-07-09', '2026-06-29')).toBe(-10);
  });
  it('is not moved by a clock change', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);   // spring forward
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);   // fall back
  });
  it('is NaN, not a number of days, when a date is unreadable', () => {
    expect(daysBetween('2026-01-01', 'nope')).toBeNaN();
  });
  it('daysUntil counts from a given today, negative once passed', () => {
    expect(daysUntil('2026-10-12', '2026-10-02')).toBe(10);
    expect(daysUntil('2026-09-30', '2026-10-02')).toBe(-2);
  });
});

describe('isOverdue (London calendar)', () => {
  it('is overdue from the day after the deadline, not on it', () => {
    const t = today();
    expect(isOverdue(t)).toBe(false);
    expect(isOverdue(addDaysISO(t, -1))).toBe(true);
    expect(isOverdue(addDaysISO(t, 1))).toBe(false);
  });
});

describe('addMonthsISO', () => {
  it('adds months, clamping a day the target month lacks', () => {
    expect(addMonthsISO('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsISO('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsISO('2026-11-30', 2)).toBe('2027-01-30');
    expect(addMonthsISO('nope', 1)).toBeNull();
  });
});

// The MOR 10-day clock. A person in London means London wall-clock time, and
// the answer must not depend on where the code runs (the server is in UTC).
describe('addDaysLondon', () => {
  it('keeps the London clock time across the autumn change (241 hours)', () => {
    // 09:00 BST on 20 Oct = 08:00 UTC → 09:00 GMT on 30 Oct = 09:00 UTC.
    expect(addDaysLondon(new Date('2026-10-20T08:00:00Z'), 10).toISOString()).toBe('2026-10-30T09:00:00.000Z');
  });
  it('keeps the London clock time across the spring change (239 hours)', () => {
    // 09:00 GMT on 25 Mar = 09:00 UTC → 09:00 BST on 4 Apr = 08:00 UTC.
    expect(addDaysLondon(new Date('2026-03-25T09:00:00Z'), 10).toISOString()).toBe('2026-04-04T08:00:00.000Z');
  });
  it('is plain 10 x 24 hours when no clock change intervenes', () => {
    expect(addDaysLondon('2026-07-01T10:30:00Z', 10).toISOString()).toBe('2026-07-11T10:30:00.000Z');
  });
});

// Formatting is London's wherever it runs — the Word documents are made on a
// UTC server, and printed every summer time an hour behind until 2026-10-02.
describe('formatting in London time', () => {
  it('prints the London time of an instant, not the zone the code runs in', () => {
    expect(fmtTime('2026-07-01T13:35:00Z')).toBe('14:35');   // BST
    expect(fmtTime('2026-12-01T13:35:00Z')).toBe('13:35');   // GMT
  });
  it('shows a calendar date as itself, whatever the zone', () => {
    expect(fmtDateOnly('2026-03-29')).toBe('29 Mar 2026');
    expect(fmtDateOnly('2026-10-25')).toBe('25 Oct 2026');
  });
  it('stamps a generated document', () => {
    expect(fmtGenerated()).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/);
  });
});
