// src/lib/apps/inspection/utils/inspectionWalk.test.js
import { describe, it, expect } from 'vitest';
import {
  buildWalkComponents,
  firstNonEmptyFloor,
  initFloorProgress,
  calcFloorProgress,
} from './inspectionWalk.js';

// Minimal component factory.
const c = (id, type_code, extra = {}) => ({ id, type_code, asset_id: id, ...extra });

describe('buildWalkComponents', () => {
  it('keeps only components whose type_code is in the filter', () => {
    const comps = [c('a', 'fire_door'), c('b', 'lamp'), c('d', 'fire_door')];
    const out = buildWalkComponents(comps, ['fire_door'], false);
    expect(out.map(x => x.id)).toEqual(['a', 'd']);
  });

  it('emergencyOnly keeps only components flagged Emergency=true (case-insensitive attr name)', () => {
    const comps = [c('a', 'lamp'), c('b', 'lamp')];
    const attrs = {
      a: [{ attr_name: 'Emergency', value: 'true' }],
      b: [{ attr_name: 'Emergency', value: 'false' }],
    };
    const out = buildWalkComponents(comps, ['lamp'], true, attrs);
    expect(out.map(x => x.id)).toEqual(['a']);
  });

  it('emergencyOnly excludes components with no attrs at all', () => {
    const comps = [c('a', 'lamp')];
    expect(buildWalkComponents(comps, ['lamp'], true, {})).toEqual([]);
  });

  it('excludes components with walk order 0 (internal/off-walk) but keeps null/unset', () => {
    const comps = [
      c('keep-null', 't', { inspection_sort_order: null }),
      c('keep-unset', 't'),                                  // undefined
      c('keep-1', 't', { inspection_sort_order: 1 }),
      c('skip-zero', 't', { inspection_sort_order: 0 }),
    ];
    const out = buildWalkComponents(comps, ['t'], false);
    expect(out.map(x => x.id)).not.toContain('skip-zero');
    expect(out.map(x => x.id).sort()).toEqual(['keep-1', 'keep-null', 'keep-unset']);
  });

  it('sorts by inspection_sort_order with nulls last', () => {
    const comps = [
      c('x', 't', { inspection_sort_order: null }),
      c('y', 't', { inspection_sort_order: 2 }),
      c('z', 't', { inspection_sort_order: 1 }),
    ];
    const out = buildWalkComponents(comps, ['t'], false);
    expect(out.map(x => x.id)).toEqual(['z', 'y', 'x']);
  });

  it('falls back to numeric-aware asset_id when sort order is unset (D2 before D10)', () => {
    const comps = [
      c('D10', 't', { asset_id: 'D10' }),
      c('D2', 't', { asset_id: 'D2' }),
    ];
    const out = buildWalkComponents(comps, ['t'], false);
    expect(out.map(x => x.asset_id)).toEqual(['D2', 'D10']);
  });
});

describe('firstNonEmptyFloor', () => {
  const floors = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
  const all = {
    f1: [],
    f2: [c('a', 't')],
    f3: [c('b', 't')],
  };

  it('scans forward and returns the first floor with matching components', () => {
    const r = firstNonEmptyFloor(floors, all, ['t'], false, {}, 0, 1);
    expect(r.floor.id).toBe('f2');
    expect(r.index).toBe(1);
    expect(r.components.map(x => x.id)).toEqual(['a']);
  });

  it('scans backward', () => {
    const r = firstNonEmptyFloor(floors, all, ['t'], false, {}, 2, -1);
    expect(r.floor.id).toBe('f3');
    expect(r.index).toBe(2);
  });

  it('returns null when no floor has matching components', () => {
    const r = firstNonEmptyFloor(floors, all, ['none'], false, {}, 0, 1);
    expect(r).toBeNull();
  });

  it('respects the start index (does not look behind it going forward)', () => {
    const r = firstNonEmptyFloor(floors, all, ['t'], false, {}, 2, 1);
    expect(r.floor.id).toBe('f3');
  });
});

describe('initFloorProgress', () => {
  it('reports totals with zero inspected', () => {
    const floors = [{ id: 'f1' }, { id: 'f2' }];
    const all = { f1: [c('a', 't'), c('b', 't')], f2: [c('d', 't')] };
    expect(initFloorProgress(floors, all, ['t'], false, {})).toEqual({
      f1: { inspected: 0, total: 2 },
      f2: { inspected: 0, total: 1 },
    });
  });
});

describe('calcFloorProgress', () => {
  it('counts inspected components per floor against the inspections map', () => {
    const floors = [{ id: 'f1' }, { id: 'f2' }];
    const all = { f1: [c('a', 't'), c('b', 't')], f2: [c('d', 't')] };
    const inspections = { a: { id: 'i1' } }; // only 'a' inspected
    expect(calcFloorProgress(floors, all, ['t'], false, {}, inspections)).toEqual({
      f1: { total: 2, inspected: 1 },
      f2: { total: 1, inspected: 0 },
    });
  });
});
