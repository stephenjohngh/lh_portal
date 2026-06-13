// src/lib/apps/building_assets/utils/componentsFilter.test.js
// Type-1 tests for the Components-tab filter pipeline.

import { describe, it, expect } from 'vitest';
import { filterComponents, describeComponentFilters } from './componentsFilter.js';

const types = [
  { id: 't1', code: 'door',  name: 'Door',  building_system_id: 'fire' },
  { id: 't2', code: 'lamp',  name: 'Lamp',  building_system_id: 'elec' },
];
const systems = [
  { id: 'fire', name: 'Fire' },
  { id: 'elec', name: 'Electrical' },
];
const floors = [
  { id: 'fG', short_name: 'G' },
  { id: 'f1', short_name: '1' },
  { id: 'fX', short_name: 'X' },
];
const comps = [
  { id: 'c1', type_code: 'door', floor_id: 'fG', asset_id: 'D1', label: 'Main door',  status: 'ok',      linked_component_ref: '' },
  { id: 'c2', type_code: 'lamp', floor_id: 'f1', asset_id: 'L1', label: 'Stair lamp', status: 'failed',  linked_component_ref: 'X9' },
  { id: 'c3', type_code: 'door', floor_id: 'fX', asset_id: 'D2', label: 'Plant door', status: 'problem', linked_component_ref: '' },
];

const emptyCriteria = (over = {}) => ({
  floorPreset: 'all',
  residentialFloorIds: new Set(['fG', 'f1']),
  basementFloorIds:    new Set(['fX']),
  filterFloorIds:  new Set(),
  filterSystemIds: new Set(),
  filterTypeCodes: new Set(),
  filterStatuses:  new Set(),
  searchQuery: '',
  fixedAttrFilters: [],
  conditionAttrFilters: [],
  ...over,
});
const ctx = { types, attrDefs: {}, componentAttrs: {}, inspections: {} };
const ids = (list) => list.map(c => c.id);

describe('filterComponents', () => {
  it('returns everything with no filters', () => {
    expect(ids(filterComponents(comps, emptyCriteria(), ctx))).toEqual(['c1', 'c2', 'c3']);
  });

  it('residential / basement floor presets', () => {
    expect(ids(filterComponents(comps, emptyCriteria({ floorPreset: 'residential' }), ctx))).toEqual(['c1', 'c2']);
    expect(ids(filterComponents(comps, emptyCriteria({ floorPreset: 'basement' }), ctx))).toEqual(['c3']);
  });

  it('custom floor set', () => {
    expect(ids(filterComponents(comps, emptyCriteria({ floorPreset: 'custom', filterFloorIds: new Set(['fG']) }), ctx)))
      .toEqual(['c1']);
  });

  it('system filter (via the type’s building_system_id)', () => {
    expect(ids(filterComponents(comps, emptyCriteria({ filterSystemIds: new Set(['fire']) }), ctx))).toEqual(['c1', 'c3']);
  });

  it('type filter', () => {
    expect(ids(filterComponents(comps, emptyCriteria({ filterTypeCodes: new Set(['lamp']) }), ctx))).toEqual(['c2']);
  });

  it('status filter (lowercased; default ok)', () => {
    expect(ids(filterComponents(comps, emptyCriteria({ filterStatuses: new Set(['failed', 'problem']) }), ctx)))
      .toEqual(['c2', 'c3']);
  });

  it('search matches asset_id, label, or linked ref (case-insensitive)', () => {
    expect(ids(filterComponents(comps, emptyCriteria({ searchQuery: 'stair' }), ctx))).toEqual(['c2']); // label
    expect(ids(filterComponents(comps, emptyCriteria({ searchQuery: 'd2' }), ctx))).toEqual(['c3']);     // asset_id
    expect(ids(filterComponents(comps, emptyCriteria({ searchQuery: 'x9' }), ctx))).toEqual(['c2']);     // linked ref
  });

  it('combines filters with AND semantics', () => {
    const out = filterComponents(comps, emptyCriteria({
      filterSystemIds: new Set(['fire']),     // c1, c3
      filterStatuses:  new Set(['problem']),  // c3
    }), ctx);
    expect(ids(out)).toEqual(['c3']);
  });

  it('applies attribute filters via matchesAllAttrFilters', () => {
    const aCtx = {
      types,
      attrDefs: { t1: [{ id: 'm1', name: 'Material', checkable: false }] },
      componentAttrs: { c1: [{ type_attribute_id: 'm1', value: 'Steel' }] }, // c3 has none
      inspections: {},
    };
    const out = filterComponents(comps, emptyCriteria({
      filterTypeCodes:  new Set(['door']),                                   // c1, c3
      fixedAttrFilters: [{ defId: 'm1', op: 'in', values: ['Steel'], includeUnset: false }],
    }), aCtx);
    expect(ids(out)).toEqual(['c1']);                                        // only the Steel door
  });
});

describe('describeComponentFilters', () => {
  const ref = { floors, systems, types };
  it('describes "All components" when nothing is set', () => {
    expect(describeComponentFilters(emptyCriteria(), ref)).toBe('All components');
  });
  it('joins active filter parts with a middot', () => {
    const s = describeComponentFilters(emptyCriteria({
      filterSystemIds: new Set(['fire']),
      filterTypeCodes: new Set(['door']),
      searchQuery: 'plant',
    }), ref);
    expect(s).toBe('Systems: Fire · Types: Door · Search: "plant"');
  });
  it('omits the status part when all four statuses are selected', () => {
    const s = describeComponentFilters(emptyCriteria({ filterStatuses: new Set(['ok', 'problem', 'failed', 'inactive']) }), ref);
    expect(s).toBe('All components');
  });
});
