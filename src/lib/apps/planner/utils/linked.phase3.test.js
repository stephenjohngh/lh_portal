// src/lib/apps/planner/utils/linked.phase3.test.js
//
// Works schedules on their expected completion date (migration 219), and
// phase 3 — open faults with no works schedule issued, as Needs arranging.
import { describe, it, expect } from 'vitest';
import {
  SOURCES, linkedOccurrences, fromWorksDue, fromUnaddressedFault,
} from './linked.js';
import { bucketOf } from './agenda.js';

const TODAY = '2026-09-23';
const bucket = (item) => bucketOf(item, TODAY);

describe('works schedules', () => {
  it('are governed by Building Assets', () => {
    expect(SOURCES.works_due.appId).toBe('building_assets');
  });

  // A contractor already holds an issued schedule: it is booked, never "arranging".
  it('are never in Needs arranging', () => {
    const item = fromWorksDue({ id: 'w1', title: 'Lighting', expected_completion: '2026-09-30' });
    expect(item.needsArranging).toBe(false);
    expect(bucket(item)).toBe('due_soon');
  });

  it('are overdue once the expected completion date has passed', () => {
    expect(bucket(fromWorksDue({ id: 'w1', title: 'Lighting', expected_completion: '2026-09-01' }))).toBe('overdue');
  });

  it('show nothing without an expected completion date', () => {
    expect(fromWorksDue({ id: 'w1', title: 'Lighting', expected_completion: null })).toBeNull();
  });
});

describe('open faults with no works schedule issued', () => {
  it('are governed by Building Assets', () => {
    expect(SOURCES.fault.appId).toBe('building_assets');
  });

  // A fault has no due date; "broken and nobody asked to fix it" is exactly
  // Needs arranging, today.
  it('sit in Needs arranging today', () => {
    const item = fromUnaddressedFault({ id: 'c1', status: 'failed', label: 'EL-12' }, TODAY);
    expect(item.date).toBe(TODAY);
    expect(bucket(item)).toBe('arranging');
    expect(item.series.title).toBe('Fault: EL-12');
  });

  // The label is the honesty: only works schedules are looked at.
  it('say no works schedule is issued, never that nothing is being done', () => {
    const item = fromUnaddressedFault({ id: 'c1', status: 'problem', label: 'EL-12' }, TODAY);
    expect(item.note).toMatch(/no works schedule issued/i);
    expect(item.note).not.toMatch(/nothing is being done/i);
  });

  it('both come through linkedOccurrences', () => {
    const items = linkedOccurrences({
      worksDue: [{ id: 'w', title: 't', expected_completion: '2026-10-01' }],
      faults: [{ id: 'c', status: 'failed', label: 'x' }],
    }, TODAY);
    expect(items.map((i) => i.source).sort()).toEqual(['fault', 'works_due']);
  });
});
