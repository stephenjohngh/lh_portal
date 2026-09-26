// src/lib/apps/building_assets/utils/spaceTypeOptions.test.js
import { describe, it, expect } from 'vitest';
import { typesForKind, typeKind, PARKING_BAY_TYPES } from './spaceTypeOptions.js';
import { SPACE_TYPES } from '../components/plan/planMeasure.js';

const rows = [
  { value: 'Plant Room', kind: 'space' },
  { value: 'Car Park',   kind: 'space' },
  { value: 'Car',        kind: 'slot' },
  { value: 'Bicycle',    kind: 'slot' },
];

describe('typesForKind', () => {
  it('offers a Parking bay only bay sizes, and a Space only room types', () => {
    expect(typesForKind(rows, 'slot')).toEqual(['Car', 'Bicycle']);
    expect(typesForKind(rows, 'space')).toEqual(['Plant Room', 'Car Park']);
  });

  // The fault this exists to prevent: one list served both kinds, so a bay
  // could be a Stairwell and a room could be a bay size.
  it('never offers a type of one kind to the other', () => {
    const bay = typesForKind(rows, 'slot');
    const room = typesForKind(rows, 'space');
    expect(bay.filter(v => room.includes(v))).toEqual([]);
  });

  it('treats a row with no kind as a Space type (every row before migration 220)', () => {
    const old = [{ value: 'Plant Room' }, { value: 'Store' }];
    expect(typesForKind(old, 'space')).toEqual(['Plant Room', 'Store']);
    expect(typesForKind(old, 'slot')).toEqual(PARKING_BAY_TYPES);
    expect(typeKind({ value: 'x' })).toBe('space');
  });

  it('falls back to the shipped defaults when a kind has nothing configured', () => {
    expect(typesForKind([], 'space')).toEqual(SPACE_TYPES);
    expect(typesForKind(null, 'slot')).toEqual(PARKING_BAY_TYPES);
  });

  it('ships the four bay sizes the user asked for', () => {
    expect(PARKING_BAY_TYPES).toEqual(['Large car', 'Car', 'Motorcycle', 'Bicycle']);
  });
});
