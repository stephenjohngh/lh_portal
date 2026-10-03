// src/lib/apps/inspection/utils/sessionStart.test.js
import { describe, it, expect } from 'vitest';
import { newSessionRecord, freshWalkState } from './sessionStart.js';

const walk = [{ type_code: 'door_fire_door' }, { type_code: 'light_emergency' }, { type_code: 'door_fire_door' }];
const base = { sessionType: 'inspection', scope: /** @type {'single_floor'|'building'} */ ('single_floor'),
               components: walk, building: 'LH', floorId: 'f1', sessionName: 'Monday walk' };

describe('newSessionRecord', () => {
  it('a definition session records the types it actually walks, once each, as a custom preset', () => {
    const r = newSessionRecord({ ...base, definition: { id: 'd1' }, preset: 'fire_doors',
                                 typeFilter: ['ignored'], emergencyOnly: true });
    expect(JSON.parse(r.type_filter)).toEqual(['door_fire_door', 'light_emergency']);
    expect(r).toMatchObject({ session_preset: 'custom', emergency_only: false, definition_id: 'd1' });
  });

  it('a session without a definition records the filter it was started with', () => {
    const r = newSessionRecord({ ...base, preset: 'fire_doors', typeFilter: ['door_fire_door'], emergencyOnly: true });
    expect(JSON.parse(r.type_filter)).toEqual(['door_fire_door']);
    expect(r).toMatchObject({ session_preset: 'fire_doors', emergency_only: true, definition_id: null });
  });

  it('counts the whole walk, and starts with nothing inspected', () => {
    expect(newSessionRecord(base)).toMatchObject({ total_components_count: 3, inspected_components_count: 0 });
  });

  it('carries a trigger only for a rotating session — the key is absent otherwise', () => {
    expect(newSessionRecord(base)).not.toHaveProperty('trigger_component_id');
    expect(newSessionRecord({ ...base, definition: { id: 'd1' }, triggerComponentId: 'c9' }))
      .toHaveProperty('trigger_component_id', 'c9');
  });

  it('records where and what, as given', () => {
    expect(newSessionRecord({ ...base, scope: /** @type {const} */ ('building'), floorId: null })).toMatchObject({
      session_type: 'inspection', session_scope: 'building', building: 'LH', floor_id: null, session_name: 'Monday walk',
    });
  });
});

describe('freshWalkState', () => {
  it('starts at the first component with nothing inspected, and no floors unless given', () => {
    const floor = { id: 'f1' };
    expect(freshWalkState({ walkComponents: walk, currentFloor: floor })).toEqual({
      walkComponents: walk, currentIndex: 0, inspections: {}, statusBefore: {},
      buildingFloors: [], currentFloor: floor, floorProgress: {},
    });
  });

  it('carries a building walk’s floors and progress', () => {
    const s = freshWalkState({ walkComponents: [], currentFloor: null, buildingFloors: [{ id: 'f1' }], floorProgress: { f1: 2 } });
    expect(s.buildingFloors).toEqual([{ id: 'f1' }]);
    expect(s.floorProgress).toEqual({ f1: 2 });
  });

  it('never shares its empty objects between two walks', () => {
    const a = freshWalkState({ walkComponents: [], currentFloor: null });
    const b = freshWalkState({ walkComponents: [], currentFloor: null });
    expect(a.inspections).not.toBe(b.inspections);
    expect(a.statusBefore).not.toBe(b.statusBefore);
  });
});
