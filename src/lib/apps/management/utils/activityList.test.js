// src/lib/apps/management/utils/activityList.test.js
// Type-1 tests for the activity-log derived list helpers.

import { describe, it, expect } from 'vitest';
import { linkedActionsByActivityId, filterActivities, sortActivities } from './activityList.js';

describe('linkedActionsByActivityId', () => {
  it('keys actions by their source_activity_id, ignoring unlinked ones', () => {
    const actions = [
      { id: 'x1', source_activity_id: 'a1' },
      { id: 'x2', source_activity_id: null },
      { id: 'x3' },
      { id: 'x4', source_activity_id: 'a2' },
    ];
    expect(linkedActionsByActivityId(actions)).toEqual({ a1: actions[0], a2: actions[3] });
  });
  it('tolerates null/empty input', () => {
    expect(linkedActionsByActivityId(null)).toEqual({});
    expect(linkedActionsByActivityId([])).toEqual({});
  });
});

describe('filterActivities', () => {
  const items = [{ id: 'a', historic: false }, { id: 'b', historic: true }, { id: 'c' }];
  it('hides historic items by default', () => {
    expect(filterActivities(items, false).map(i => i.id)).toEqual(['a', 'c']);
  });
  it('includes historic items when asked', () => {
    expect(filterActivities(items, true).map(i => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sortActivities', () => {
  const byDate = [
    { id: 'old', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'new', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' },
  ];

  it('does not mutate the input array', () => {
    const input = [...byDate];
    sortActivities(input, 'updated_at', 'desc');
    expect(input.map(i => i.id)).toEqual(['old', 'new']);
  });

  it('updated_at desc puts most-recently-modified first', () => {
    expect(sortActivities(byDate, 'updated_at', 'desc').map(i => i.id)).toEqual(['new', 'old']);
  });

  it('created_at sort ignores updated_at', () => {
    // "new" was created later, so created_at asc => old, new
    expect(sortActivities(byDate, 'created_at', 'asc').map(i => i.id)).toEqual(['old', 'new']);
  });

  it('sequence sort: sequenced items first (by number/dir), unsequenced fall back to date', () => {
    const items = [
      { id: 's2', sequence: 2 },
      { id: 'noseq-old', created_at: '2026-01-01T00:00:00Z' },
      { id: 's1', sequence: 1 },
      { id: 'noseq-new', created_at: '2026-02-01T00:00:00Z' },
    ];
    // desc: highest sequence first, then unsequenced by most-recent date
    expect(sortActivities(items, 'sequence', 'desc').map(i => i.id))
      .toEqual(['s2', 's1', 'noseq-new', 'noseq-old']);
    // asc: lowest sequence first, then unsequenced still by date (desc fallback within group)
    expect(sortActivities(items, 'sequence', 'asc').slice(0, 2).map(i => i.id))
      .toEqual(['s1', 's2']);
  });
});
