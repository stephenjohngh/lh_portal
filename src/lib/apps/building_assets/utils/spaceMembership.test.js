// src/lib/apps/building_assets/utils/spaceMembership.test.js
// Derive-at-read component ↔ space membership: geometric containment, the
// boundary-door-in-two-spaces case, plan scoping, and include/exclude overrides.

import { describe, it, expect } from 'vitest';
import { componentsInSpace, spacesForComponent, componentSpaceRefs, DEFAULT_TOLERANCE } from './spaceMembership.js';

// Two adjacent spaces on plan p1 sharing the wall at x = 0.5.
const A = { id: 'A', plan_id: 'p1', polygon: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }] };
const B = { id: 'B', plan_id: 'p1', polygon: [{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 1 }] };

const comp = (id, x, y, plan = 'p1') => ({ id, plan_id: plan, x_position: x, y_position: y });

describe('componentsInSpace', () => {
  it('includes a component whose point is inside, and not the neighbour', () => {
    const inA = comp('c1', 0.25, 0.5);
    expect(componentsInSpace(A, [inA]).map(c => c.id)).toEqual(['c1']);
    expect(componentsInSpace(B, [inA]).map(c => c.id)).toEqual([]);
  });

  it('puts a boundary component (door on the shared wall) in BOTH spaces', () => {
    const door = comp('d', 0.5, 0.5);   // exactly on the shared edge
    expect(componentsInSpace(A, [door]).map(c => c.id)).toEqual(['d']);
    expect(componentsInSpace(B, [door]).map(c => c.id)).toEqual(['d']);
  });

  it('excludes a component beyond the tolerance from the edge', () => {
    const near = comp('n', 0.5 + DEFAULT_TOLERANCE * 2, 0.5);  // just outside A, inside B
    expect(componentsInSpace(A, [near]).map(c => c.id)).toEqual([]);
    expect(componentsInSpace(B, [near]).map(c => c.id)).toEqual(['n']);
  });

  it('ignores components on a different plan even if coordinates fall inside', () => {
    const other = comp('o', 0.25, 0.5, 'p2');
    expect(componentsInSpace(A, [other]).map(c => c.id)).toEqual([]);
  });

  it('honours include / exclude overrides', () => {
    const inA = comp('c1', 0.25, 0.5);
    const unplaced = { id: 'u', plan_id: null, x_position: null, y_position: null };
    const overrides = [
      { space_id: 'A', component_id: 'c1', mode: 'exclude' },  // drop a geometric member
      { space_id: 'A', component_id: 'u',  mode: 'include' },  // force-add an unplaced one
    ];
    expect(componentsInSpace(A, [inA, unplaced], overrides).map(c => c.id)).toEqual(['u']);
  });
});

describe('spacesForComponent', () => {
  it('returns every space a boundary component bounds', () => {
    const door = comp('d', 0.5, 0.5);
    expect(spacesForComponent(door, [A, B]).map(s => s.id).sort()).toEqual(['A', 'B']);
  });

  it('returns the single containing space for an interior component', () => {
    const inA = comp('c1', 0.25, 0.5);
    expect(spacesForComponent(inA, [A, B]).map(s => s.id)).toEqual(['A']);
  });

  it('respects overrides and returns [] for a missing component', () => {
    const inA = comp('c1', 0.25, 0.5);
    const overrides = [{ space_id: 'A', component_id: 'c1', mode: 'exclude' }];
    expect(spacesForComponent(inA, [A, B], overrides)).toEqual([]);
    expect(spacesForComponent(null, [A, B])).toEqual([]);
  });
});

describe('componentSpaceRefs', () => {
  // Referenceable variants of the two spaces (kind + assigned_id + floor).
  const floors = [{ id: 'f1', short_name: 'G' }];
  const Ar = { ...A, kind: 'space', assigned_id: '12', floor_id: 'f1' };  // -> G/S/12
  const Br = { ...B, kind: 'space', assigned_id: '13', floor_id: 'f1' };  // -> G/S/13
  const plans = [{ id: 'p1', image_aspect_ratio: 1 }];

  it('maps a boundary component to BOTH space refs (sorted)', () => {
    const door = comp('d', 0.5, 0.5);
    const map = componentSpaceRefs([door], [Ar, Br], [], plans, floors);
    expect(map.get('d')).toEqual(['G/S/12', 'G/S/13']);
  });

  it('maps an interior component to its single space ref', () => {
    const inA = comp('c1', 0.25, 0.5);
    const map = componentSpaceRefs([inA], [Ar, Br], [], plans, floors);
    expect(map.get('c1')).toEqual(['G/S/12']);
  });

  it('omits components that fall in no space', () => {
    const outside = comp('x', 0.25, 0.5, 'p2');   // different plan
    const map = componentSpaceRefs([outside], [Ar, Br], [], plans, floors);
    expect(map.has('x')).toBe(false);
  });

  it('applies include overrides (an unplaced component pinned to a space)', () => {
    const unplaced = { id: 'u', plan_id: null, x_position: null, y_position: null };
    const overrides = [{ space_id: 'A', component_id: 'u', mode: 'include' }];
    const map = componentSpaceRefs([unplaced], [Ar, Br], overrides, plans, floors);
    expect(map.get('u')).toEqual(['G/S/12']);
  });
});
