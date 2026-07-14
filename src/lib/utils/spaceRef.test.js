// src/lib/utils/spaceRef.test.js
// Space refs are composed "{floorShortName}/{Type}/{assignedId}" (Type = S|SL),
// mirroring componentRef.js. These build/find helpers must round-trip.

import { describe, it, expect } from 'vitest';
import { buildSpaceRef, findSpaceByRef, fmtSpaceRef, spaceKindInitial, KIND_LABEL, deriveSpaceName } from './spaceRef.js';

const floors = [{ id: 'f1', short_name: 'G' }, { id: 'b1', short_name: 'B1' }];
const spaces = [
  { id: 's1', kind: 'space', floor_id: 'f1', assigned_id: '12' },
  { id: 's2', kind: 'slot',  floor_id: 'b1', assigned_id: '017' },
];

describe('spaceKindInitial / labels', () => {
  it('maps kinds to Type initials, defaulting to Space', () => {
    expect(spaceKindInitial('space')).toBe('S');
    expect(spaceKindInitial('slot')).toBe('SL');
    expect(spaceKindInitial(undefined)).toBe('S');
    expect(KIND_LABEL.slot).toBe('Slot');
  });
});

describe('buildSpaceRef', () => {
  it('composes {floor}/{Type}/{assignedId} and round-trips through findSpaceByRef', () => {
    expect(buildSpaceRef(spaces[0], floors)).toBe('G/S/12');
    expect(buildSpaceRef(spaces[1], floors)).toBe('B1/SL/017');
    expect(findSpaceByRef('B1/SL/017', spaces, floors)?.id).toBe('s2');
  });
  it('falls back assigned_id → truncated id, and "?" for an unknown floor', () => {
    expect(buildSpaceRef({ id: 'abcdef123456', kind: 'space', floor_id: 'nope' }, floors))
      .toBe('?/S/abcdef12');
  });
  it('returns a dash for a missing space', () => {
    expect(buildSpaceRef(null, floors)).toBe('—');
  });
});

describe('findSpaceByRef', () => {
  it('resolves a matching ref to its space', () => {
    expect(findSpaceByRef('G/S/12', spaces, floors)?.id).toBe('s1');
  });
  it('returns null for non-matching, wrong-kind, malformed, and empty inputs', () => {
    expect(findSpaceByRef('G/S/99', spaces, floors)).toBeNull();   // no such assigned id
    expect(findSpaceByRef('G/SL/12', spaces, floors)).toBeNull();  // kind mismatch (s1 is a Space)
    expect(findSpaceByRef('G/S', spaces, floors)).toBeNull();      // only 2 parts
    expect(findSpaceByRef('', spaces, floors)).toBeNull();
    expect(findSpaceByRef('G/S/12', [], floors)).toBeNull();
  });
});

describe('fmtSpaceRef', () => {
  it('passes a ref through, or returns a dash when empty', () => {
    expect(fmtSpaceRef('G/S/12')).toBe('G/S/12');
    expect(fmtSpaceRef('')).toBe('—');
    expect(fmtSpaceRef(null)).toBe('—');
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
