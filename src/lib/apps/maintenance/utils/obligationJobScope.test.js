// src/lib/apps/maintenance/utils/obligationJobScope.test.js
import { describe, it, expect } from 'vitest';
import { obligationJobScope, scopeSummary } from './obligationJobScope.js';

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
