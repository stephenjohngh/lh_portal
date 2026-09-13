// src/lib/utils/statutoryExclusions.test.js
import { describe, it, expect } from 'vitest';
import {
  currentDecisions, excludedKeys, decisionHistory, reviewsDue, isRecordableReason,
  reviewState, REVIEW_SOON_DAYS,
} from './statutoryExclusions.js';

const d = (key, decision, decided_at, over = {}) =>
  ({ id: `${key}-${decided_at}`, template_key: key, decision, reason: 'because', decided_at, ...over });

describe('currentDecisions', () => {
  it('takes the latest decision per key', () => {
    const rows = [
      d('lift_maintenance', 'not_applicable', '2026-01-01T00:00:00Z'),
      d('lift_maintenance', 'applicable',     '2026-06-01T00:00:00Z'),
      d('lift_loler_examination', 'not_applicable', '2026-03-01T00:00:00Z'),
    ];
    const cur = currentDecisions(rows);
    expect(cur.get('lift_maintenance').decision).toBe('applicable');
    expect(cur.get('lift_loler_examination').decision).toBe('not_applicable');
  });

  // Order of arrival must not decide the answer — the log comes back newest
  // first from the DB, but a re-sort or a cache merge could reverse that.
  it('does not depend on the order rows arrive in', () => {
    const a = d('k', 'not_applicable', '2026-01-01T00:00:00Z');
    const b = d('k', 'applicable',     '2026-06-01T00:00:00Z');
    expect(currentDecisions([a, b]).get('k').decision).toBe('applicable');
    expect(currentDecisions([b, a]).get('k').decision).toBe('applicable');
  });

  it('breaks an exact timestamp tie deterministically', () => {
    const t = '2026-01-01T00:00:00Z';
    const a = { ...d('k', 'not_applicable', t), id: 'aaa' };
    const b = { ...d('k', 'applicable', t), id: 'zzz' };
    expect(currentDecisions([a, b]).get('k').id).toBe(currentDecisions([b, a]).get('k').id);
  });

  it('ignores rows with no key, and tolerates no input', () => {
    expect(currentDecisions([{ decision: 'not_applicable' }, null]).size).toBe(0);
    expect(currentDecisions(null).size).toBe(0);
  });
});

describe('excludedKeys', () => {
  it('lists only keys whose latest decision excludes them', () => {
    const rows = [
      d('a', 'not_applicable', '2026-01-01T00:00:00Z'),
      d('b', 'not_applicable', '2026-01-01T00:00:00Z'),
      d('b', 'applicable',     '2026-02-01T00:00:00Z'),
    ];
    expect(excludedKeys(rows)).toEqual(['a']);
  });

  it('is empty for no decisions', () => {
    expect(excludedKeys([])).toEqual([]);
    expect(excludedKeys(null)).toEqual([]);
  });
});

// The log is the record: a reversal must not erase the original decision, or
// nobody can later see that the call was once made the other way.
describe('decisionHistory', () => {
  it('returns every decision for a key, newest first', () => {
    const rows = [
      d('k', 'not_applicable', '2026-01-01T00:00:00Z', { reason: 'no lift' }),
      d('k', 'applicable',     '2026-06-01T00:00:00Z', { reason: 'lift installed' }),
      d('other', 'not_applicable', '2026-02-01T00:00:00Z'),
    ];
    const h = decisionHistory(rows, 'k');
    expect(h.map(x => x.reason)).toEqual(['lift installed', 'no lift']);
  });

  it('is empty for an unknown key', () => {
    expect(decisionHistory([], 'nope')).toEqual([]);
  });
});

// An exclusion nobody revisits is how a register stays green while the building
// changes underneath it.
describe('reviewsDue', () => {
  const rows = [
    d('past',   'not_applicable', '2026-01-01T00:00:00Z', { review_due: '2026-06-01' }),
    d('soon',   'not_applicable', '2026-01-01T00:00:00Z', { review_due: '2026-09-20' }),
    d('far',    'not_applicable', '2026-01-01T00:00:00Z', { review_due: '2027-01-01' }),
    d('none',   'not_applicable', '2026-01-01T00:00:00Z'),
  ];

  it('reports exclusions whose review date has passed', () => {
    expect(reviewsDue(rows, { today: '2026-09-10' }).map(r => r.template_key)).toEqual(['past']);
  });

  it('looks ahead when asked, in date order', () => {
    expect(reviewsDue(rows, { today: '2026-09-10', withinDays: 30 }).map(r => r.template_key))
      .toEqual(['past', 'soon']);
  });

  it('ignores exclusions with no review date, and reinstated ones', () => {
    const reinstated = [
      ...rows,
      d('past', 'applicable', '2026-07-01T00:00:00Z', { review_due: '2026-06-01' }),
    ];
    expect(reviewsDue(reinstated, { today: '2026-09-10' })).toEqual([]);
  });
});

// The badge on a row and the count in the header must not be able to disagree,
// so both ask reviewState rather than each comparing dates itself.
describe('reviewState', () => {
  const today = '2026-09-10';

  it('says none when no review date was set', () => {
    expect(reviewState(null, { today })).toBe('none');
    expect(reviewState('', { today })).toBe('none');
    expect(reviewState(undefined, { today })).toBe('none');
  });

  it('treats a past date as overdue', () => {
    expect(reviewState('2026-06-01', { today })).toBe('overdue');
  });

  it('treats TODAY as overdue, not as still to come', () => {
    // A review due today is due; rendering it as "scheduled" would let it slip
    // by a day every day.
    expect(reviewState(today, { today })).toBe('overdue');
  });

  it('flags the default horizon as due soon, and beyond it as scheduled', () => {
    expect(reviewState('2026-09-20', { today })).toBe('due_soon');
    expect(reviewState('2026-12-01', { today })).toBe('scheduled');
  });

  it('puts the boundary day itself inside the horizon', () => {
    const boundary = new Date(Date.parse(`${today}T00:00:00Z`) + REVIEW_SOON_DAYS * 86_400_000)
      .toISOString().slice(0, 10);
    expect(reviewState(boundary, { today })).toBe('due_soon');
  });

  it('honours a caller-supplied horizon', () => {
    expect(reviewState('2026-09-20', { today, withinDays: 5 })).toBe('scheduled');
    expect(reviewState('2026-09-20', { today, withinDays: 60 })).toBe('due_soon');
  });

  it('agrees with reviewsDue about which rows are due', () => {
    // The two are used side by side — a row badged "overdue" that the header
    // does not count is exactly the kind of quiet disagreement this pins.
    const sample = [
      d('past', 'not_applicable', '2026-01-01T00:00:00Z', { review_due: '2026-06-01' }),
      d('soon', 'not_applicable', '2026-01-01T00:00:00Z', { review_due: '2026-09-20' }),
      d('far',  'not_applicable', '2026-01-01T00:00:00Z', { review_due: '2027-01-01' }),
      d('none', 'not_applicable', '2026-01-01T00:00:00Z'),
    ];
    const due = new Set(reviewsDue(sample, { today, withinDays: REVIEW_SOON_DAYS })
      .map(r => r.template_key));
    for (const r of sample) {
      const state = reviewState(r.review_due, { today, withinDays: REVIEW_SOON_DAYS });
      expect(due.has(r.template_key)).toBe(state === 'overdue' || state === 'due_soon');
    }
  });
});

// The DB enforces non-empty too. This is the same rule at the form, so the user
// is told before the round trip rather than by a constraint violation.
describe('isRecordableReason', () => {
  it('rejects nothing, whitespace and a shrug', () => {
    expect(isRecordableReason('')).toBe(false);
    expect(isRecordableReason('   ')).toBe(false);
    expect(isRecordableReason(null)).toBe(false);
    expect(isRecordableReason('n/')).toBe(false);
  });

  // Deliberately not a wording referee: a real reason can be four words.
  it('accepts a short but real reason', () => {
    expect(isRecordableReason('No lift in building')).toBe(true);
    expect(isRecordableReason('N/A')).toBe(true);
  });
});
