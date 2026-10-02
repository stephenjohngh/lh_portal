// src/lib/utils/spaceRef.test.js
// Space refs are composed "{floorShortName}/{Type}/{assignedId}" (Type = SP|PK),
// mirroring componentRef.js. These build/find helpers must round-trip.

import { describe, it, expect } from 'vitest';
import { buildSpaceRef, findSpaceByRef, spaceKindInitial, KIND_LABEL, KIND_INITIAL, deriveSpaceName } from './spaceRef.js';

const floors = [{ id: 'f1', short_name: 'G' }, { id: 'b1', short_name: 'B1' }];
const spaces = [
  { id: 's1', kind: 'space', floor_id: 'f1', assigned_id: '12' },
  { id: 's2', kind: 'slot',  floor_id: 'b1', assigned_id: '017' },
];

describe('spaceKindInitial / labels', () => {
  it('maps kinds to Type initials, defaulting to Space', () => {
    expect(spaceKindInitial('space')).toBe('SP');
    expect(spaceKindInitial('slot')).toBe('PK');
    expect(spaceKindInitial(undefined)).toBe('SP');
    expect(KIND_LABEL.slot).toBe('Parking bay');
  });
});

// ⛔ The rule that keeps a space ref from ever being read as a component ref.
// Component type initials are cut to one letter on save (the store test pins
// that half); a space initial must therefore be two or more letters. Until
// 2026-09-26 a Space was 'S', which seven component types also use.
describe('space refs cannot collide with component refs', () => {
  it('every kind initial is at least two letters, and no two kinds share one', () => {
    const initials = Object.values(KIND_INITIAL);
    for (const i of initials) expect(i.length, i).toBeGreaterThanOrEqual(2);
    expect(new Set(initials).size).toBe(initials.length);
  });
});

describe('buildSpaceRef', () => {
  it('composes {floor}/{Type}/{assignedId} and round-trips through findSpaceByRef', () => {
    expect(buildSpaceRef(spaces[0], floors)).toBe('G/SP/12');
    expect(buildSpaceRef(spaces[1], floors)).toBe('B1/PK/017');
    expect(findSpaceByRef('B1/PK/017', spaces, floors)?.id).toBe('s2');
  });
  it('falls back assigned_id → truncated id, and "?" for an unknown floor', () => {
    expect(buildSpaceRef({ id: 'abcdef123456', kind: 'space', floor_id: 'nope' }, floors))
      .toBe('?/SP/abcdef12');
  });
  it('returns a dash for a missing space', () => {
    expect(buildSpaceRef(null, floors)).toBe('—');
  });
});

describe('findSpaceByRef', () => {
  it('resolves a matching ref to its space', () => {
    expect(findSpaceByRef('G/SP/12', spaces, floors)?.id).toBe('s1');
  });
  it('returns null for non-matching, wrong-kind, malformed, and empty inputs', () => {
    expect(findSpaceByRef('G/SP/99', spaces, floors)).toBeNull();   // no such assigned id
    expect(findSpaceByRef('G/PK/12', spaces, floors)).toBeNull();  // kind mismatch (s1 is a Space)
    expect(findSpaceByRef('G/SP', spaces, floors)).toBeNull();      // only 2 parts
    expect(findSpaceByRef('', spaces, floors)).toBeNull();
    expect(findSpaceByRef('G/SP/12', [], floors)).toBeNull();
  });
});

describe('deriveSpaceName', () => {
  it('strips whitespace, newlines and non-alphanumerics from a label', () => {
    expect(deriveSpaceName('Plant\nRoom 2')).toBe('PlantRoom2');
    expect(deriveSpaceName('Stair B — West')).toBe('StairBWest');
  });
  it('handles empty / nullish input', () => {
    expect(deriveSpaceName('')).toBe('');
    expect(deriveSpaceName(null)).toBe('');
    expect(deriveSpaceName(undefined)).toBe('');
  });
  it('leaves an already-single-word alphanumeric name unchanged (idempotent)', () => {
    expect(deriveSpaceName('PlantRoom2')).toBe('PlantRoom2');
  });
});
