// src/lib/apps/maintenance/utils/jobHistorySuggest.test.js
//
// Pins the job-history last-renewal suggestion: scope matching (system/type/
// component), building exclusion, incomplete-job exclusion, recency ordering and
// the limit. Suggestion-only — no side effects to assert, just the ranked list.

import { describe, it, expect } from 'vitest';
import { suggestLastRenewal } from './jobHistorySuggest.js';

const job = (over) => ({
  id: 'j', title: 'Job', completed_date: '2025-01-01', status: 'completed',
  scope_type: 'system', scope_id: null, scope_label: null, ...over,
});

describe('suggestLastRenewal', () => {
  it('matches system-scoped jobs by scope_id', () => {
    const r = suggestLastRenewal(
      { systemIds: ['sys-elec'] },
      [job({ id: 'a', scope_type: 'system', scope_id: 'sys-elec' }),
       job({ id: 'b', scope_type: 'system', scope_id: 'sys-mech' })]);
    expect(r.candidates.map(c => c.id)).toEqual(['a']);
    expect(r.best.id).toBe('a');
  });

  it('matches type-scoped jobs via typeIdToCode (and a raw-code fallback)', () => {
    const jobs = [
      job({ id: 'byId',   scope_type: 'type', scope_id: 'type-uuid-1' }),
      job({ id: 'byCode', scope_type: 'type', scope_id: 'LIFT' }),
      job({ id: 'other',  scope_type: 'type', scope_id: 'type-uuid-9' }),
    ];
    const r = suggestLastRenewal(
      { typeCodes: ['LIGHT', 'LIFT'] }, jobs,
      { typeIdToCode: { 'type-uuid-1': 'LIGHT' } });
    expect(r.candidates.map(c => c.id).sort()).toEqual(['byCode', 'byId']);
  });

  it('matches component-scoped jobs by member intersection', () => {
    const r = suggestLastRenewal(
      { componentIds: ['c1', 'c2'] },
      [job({ id: 'hit',  scope_type: 'component', componentIds: ['c2', 'c9'] }),
       job({ id: 'miss', scope_type: 'component', componentIds: ['c8'] })]);
    expect(r.candidates.map(c => c.id)).toEqual(['hit']);
  });

  it('excludes building-scoped jobs', () => {
    const r = suggestLastRenewal(
      { systemIds: ['sys-elec'] },
      [job({ id: 'bld', scope_type: 'building', scope_id: null })]);
    expect(r.candidates).toEqual([]);
    expect(r.best).toBeNull();
  });

  it('excludes jobs that are not completed or lack a completed_date', () => {
    const r = suggestLastRenewal(
      { systemIds: ['s'] },
      [job({ id: 'sched', scope_id: 's', status: 'scheduled', completed_date: null }),
       job({ id: 'nodate', scope_id: 's', status: 'completed', completed_date: null })]);
    expect(r.candidates).toEqual([]);
  });

  it('orders most-recent first and applies the limit', () => {
    const jobs = ['2020-06-01', '2024-03-01', '2022-09-01', '2026-01-01'].map((d, i) =>
      job({ id: `j${i}`, scope_id: 's', completed_date: d }));
    const r = suggestLastRenewal({ systemIds: ['s'] }, jobs, { limit: 2 });
    expect(r.candidates.map(c => c.completed_date)).toEqual(['2026-01-01', '2024-03-01']);
    expect(r.best.completed_date).toBe('2026-01-01');
  });

  it('returns an empty result for a group with no criteria', () => {
    const r = suggestLastRenewal({}, [job({ scope_id: 's' })]);
    expect(r.candidates).toEqual([]);
    expect(r.best).toBeNull();
  });
});
