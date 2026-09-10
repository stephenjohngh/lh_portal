// src/lib/apps/admin/utils/typeScopedObligations.test.js
import { describe, it, expect } from 'vitest';
import { obligationsForType, scopedToTypeOnly, typeCount } from './typeScopedObligations.js';

const ob = (id, scope) => ({ id, name: id, scope });

describe('obligationsForType', () => {
  const all = [
    ob('a', { typeCodes: ['door_fire'] }),
    ob('b', { typeCodes: ['door_fire', 'light_em'] }),
    ob('c', { typeCodes: ['light_em'] }),
    ob('d', {}),                       // building-wide
    ob('e', { systemIds: ['s1'] }),    // system-scoped
  ];

  // A multi-type obligation appearing under each of its types is correct: the
  // panel answers "what is this type obliged to have done".
  it('includes every obligation naming the type, including multi-type ones', () => {
    expect(obligationsForType(all, 'door_fire').map(o => o.id)).toEqual(['a', 'b']);
  });

  it('excludes obligations that do not name it', () => {
    expect(obligationsForType(all, 'riser').map(o => o.id)).toEqual([]);
  });

  it('is empty without a type code, and tolerates no input', () => {
    expect(obligationsForType(all, '')).toEqual([]);
    expect(obligationsForType(all, null)).toEqual([]);
    expect(obligationsForType(null, 'door_fire')).toEqual([]);
  });
});

// The safety rule: editing from a type's panel must not reach types you
// cannot see from that panel.
describe('scopedToTypeOnly', () => {
  it('is true when the type is the entire scope', () => {
    expect(scopedToTypeOnly(ob('a', { typeCodes: ['door_fire'] }), 'door_fire')).toBe(true);
  });

  it('is false when other types are covered too', () => {
    expect(scopedToTypeOnly(ob('b', { typeCodes: ['door_fire', 'light_em'] }), 'door_fire')).toBe(false);
  });

  it('is false when a system or floor narrows it as well', () => {
    expect(scopedToTypeOnly(ob('c', { typeCodes: ['door_fire'], systemIds: ['s1'] }), 'door_fire')).toBe(false);
    expect(scopedToTypeOnly(ob('d', { typeCodes: ['door_fire'], floorIds: ['f1'] }), 'door_fire')).toBe(false);
  });

  it('is false for a building-wide obligation, and for a different type', () => {
    expect(scopedToTypeOnly(ob('e', {}), 'door_fire')).toBe(false);
    expect(scopedToTypeOnly(ob('f', { typeCodes: ['light_em'] }), 'door_fire')).toBe(false);
  });

  it('tolerates a missing scope', () => {
    expect(scopedToTypeOnly({}, 'door_fire')).toBe(false);
    expect(scopedToTypeOnly(null, 'door_fire')).toBe(false);
  });
});

describe('typeCount', () => {
  it('counts the types covered', () => {
    expect(typeCount(ob('b', { typeCodes: ['a', 'b', 'c'] }))).toBe(3);
    expect(typeCount(ob('d', {}))).toBe(0);
    expect(typeCount(null)).toBe(0);
  });
});
