// src/lib/utils/statutoryExclusions.test.js
import { describe, it, expect } from 'vitest';
import {
  currentDecisions, excludedKeys, decisionHistory, reviewsDue, isRecordableReason,
} from './statutoryExclusions.js';

const d = (key, decision, decided_at, over = {}) =>
  ({ id: `${key}-${decided_at}`, template_key: key, decision, reason: 'because', decided_at, ...over });

describe('currentDecisions', () => {
  it('takes the latest decision per key', () => {
    const rows = [
      d('lift_maintenance', 'not_applicable', '2026-01-01T00:00:00Z'),
      d('lift_maintenance', 'applicable',     '2026-06-01T00:00:00Z'),
      d('gas_safety_check', 'not_applicable', '2026-03-01T00:00:00Z'),
    ];
    const cur = currentDecisions(rows);
    expect(cur.get('lift_maintenance').decision).toBe('applicable');
    expect(cur.get('gas_safety_check').decision).toBe('not_applicable');
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
