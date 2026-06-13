// src/lib/utils/dates.test.js
// All assertions use 12:00 UTC timestamps (or shape-only checks for
// local-time output) so they pass in any CI/dev timezone within ±11h.
import { describe, it, expect } from 'vitest';
import {
  fmtDate, fmtDateLong, fmtTime, fmtDateTime, fmtDuration,
  isOverdue, wasModified, fmtShortDate, fmtDateOnly,
  toDateString, addDays, fmtMonthYearCompact,
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
