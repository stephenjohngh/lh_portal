// src/lib/apps/maintenance/utils/obligationJobScope.test.js
import { describe, it, expect } from 'vitest';
import { obligationJobScope, scopeSummary, plannedOccurrenceDates } from './obligationJobScope.js';

const ctx = {
  types: [
    { id: 't-fd', code: 'door_fire_door', name: 'Fire Door' },
    { id: 't-el', code: 'light_emergency', name: 'Emergency Light' },
    { id: 't-ap', code: 'door_apartment',  name: 'Apartment Door' },
    { id: 't-cp', code: 'alarm_callpoint', name: 'Call Point' },
  ],
  systems: [
    { id: 's-fire', name: 'Fire Alarm' },
    { id: 's-elec', name: 'Electrical' },
  ],
};

const ob = (scope, name = 'Obligation') => ({ name, scope });

describe('obligationJobScope', () => {
  // Matches what the old per-type maintenance_regime produced, so generated
  // jobs stay recognisable to anyone used to the previous behaviour.
  it('scopes to the type when the obligation covers exactly one', () => {
    expect(obligationJobScope(ob({ typeCodes: ['door_fire_door'] }), ctx))
      .toEqual({ scope_type: 'type', scope_id: 't-fd', scope_label: 'Fire Door' });
  });

  it('scopes to the system when the obligation covers exactly one', () => {
    expect(obligationJobScope(ob({ systemIds: ['s-fire'] }), ctx))
      .toEqual({ scope_type: 'system', scope_id: 's-fire', scope_label: 'Fire Alarm' });
  });

  // A job is a visit, not a checklist: several types is still one attendance.
  it('scopes to the building when several types are covered', () => {
    const r = obligationJobScope(ob({ typeCodes: ['door_fire_door', 'light_emergency'] }), ctx);
    expect(r.scope_type).toBe('building');
    expect(r.scope_id).toBeNull();
    expect(r.scope_label).toBe('Fire Door, Emergency Light');
  });

  it('scopes to the building when a type and a system are mixed', () => {
    expect(obligationJobScope(ob({ typeCodes: ['door_fire_door'], systemIds: ['s-fire'] }), ctx).scope_type)
      .toBe('building');
  });

  it('scopes to the building when the obligation narrows nothing', () => {
    expect(obligationJobScope(ob({}), ctx))
      .toEqual({ scope_type: 'building', scope_id: null, scope_label: 'Building-wide' });
    expect(obligationJobScope(ob(null), ctx).scope_type).toBe('building');
    expect(obligationJobScope(null, ctx).scope_type).toBe('building');
  });

  it('falls back to the raw code when the type is unknown to the lookup', () => {
    expect(obligationJobScope(ob({ typeCodes: ['ghost_type'] }), ctx))
      .toEqual({ scope_type: 'type', scope_id: null, scope_label: 'ghost_type' });
  });
});

describe('scopeSummary', () => {
  it('names systems then types', () => {
    expect(scopeSummary(ob({ systemIds: ['s-fire'], typeCodes: ['door_fire_door'] }), ctx))
      .toBe('Fire Alarm · Fire Door');
  });

  // Past three names a count reads better than a truncated list in a table cell.
  it('counts types once there are more than three', () => {
    expect(scopeSummary(ob({ typeCodes: ['door_fire_door', 'light_emergency', 'door_apartment', 'alarm_callpoint'] }), ctx))
      .toBe('4 types');
  });

  it('lists up to three by name', () => {
    expect(scopeSummary(ob({ typeCodes: ['door_fire_door', 'light_emergency', 'door_apartment'] }), ctx))
      .toBe('Fire Door, Emergency Light, Apartment Door');
  });

  it('counts systems it cannot name', () => {
    expect(scopeSummary(ob({ systemIds: ['unknown-1', 'unknown-2'] }), ctx)).toBe('2 systems');
  });

  it('says building-wide when nothing narrows it', () => {
    expect(scopeSummary(ob({}), ctx)).toBe('Building-wide');
  });
});

// This walk is shared by the Scheduler's preview count and the actual
// generator. It was two copies before; these tests are what keeps the promise
// ("will create N jobs") and the outcome from drifting apart.
describe('plannedOccurrenceDates', () => {
  const walk = (over = {}) => plannedOccurrenceDates({
    existingDates: [], from: '2026-01-01', to: '2026-02-15', frequencyDays: 30, ...over,
  });

  it('lays out from the range start at the given cadence', () => {
    // 01-01, +30 = 01-31, +30 = 03-02 (past `to`, stop)
    expect(walk()).toEqual(['2026-01-01', '2026-01-31']);
  });

  it('is inclusive of the end date', () => {
    expect(walk({ from: '2026-01-01', to: '2026-01-31' })).toEqual(['2026-01-01', '2026-01-31']);
  });

  it('resumes one interval after the latest existing job, not at the range start', () => {
    expect(walk({ existingDates: ['2026-01-05'], to: '2026-03-10' }))
      .toEqual(['2026-02-04', '2026-03-06']);
  });

  it('skips a date that is already taken', () => {
    expect(walk({ existingDates: ['2026-01-01'], from: '2026-01-01', to: '2026-02-15' }))
      .toEqual(['2026-01-31']);
  });

  it('is idempotent — a second run over the same range plans nothing new', () => {
    const first = walk();
    expect(plannedOccurrenceDates({
      existingDates: first, from: '2026-01-01', to: '2026-02-15', frequencyDays: 30,
    })).toEqual([]);
  });

  // An on-demand obligation has no series; a zero would also spin forever.
  it('plans nothing without a usable cadence', () => {
    expect(walk({ frequencyDays: null })).toEqual([]);
    expect(walk({ frequencyDays: 0 })).toEqual([]);
    expect(walk({ frequencyDays: -5 })).toEqual([]);
  });

  it('plans nothing when the range is missing or inverted', () => {
    expect(walk({ from: null })).toEqual([]);
    expect(walk({ to: null })).toEqual([]);
    expect(walk({ from: '2026-06-01', to: '2026-01-01' })).toEqual([]);
  });

  it('never emits the same date twice within one run', () => {
    const dates = walk({ from: '2026-01-01', to: '2026-12-31', frequencyDays: 1 });
    expect(new Set(dates).size).toBe(dates.length);
  });
});
