// src/lib/apps/building_assets/utils/inspectionScope.test.js
import { describe, it, expect } from 'vitest';
import { applyInspectionScope, scopeToCriteria, isEmptyScope } from './inspectionScope.js';

const types = [
  { id: 't1', code: 'door', name: 'Door', building_system_id: 'fire' },
  { id: 't2', code: 'lamp', name: 'Lamp', building_system_id: 'elec' },
];
const comps = [
  { id: 'c1', type_code: 'door', floor_id: 'fG', asset_id: 'D1', status: 'ok' },
  { id: 'c2', type_code: 'lamp', floor_id: 'f1', asset_id: 'L1', status: 'failed' },
  { id: 'c3', type_code: 'door', floor_id: 'fX', asset_id: 'D2', status: 'problem' },
];
const ctx = { types, attrDefs: {}, componentAttrs: {}, inspections: {} };
const ids = (list) => list.map(c => c.id);

describe('applyInspectionScope', () => {
  it('empty scope matches everything', () => {
    expect(ids(applyInspectionScope(comps, {}, ctx))).toEqual(['c1', 'c2', 'c3']);
  });

  it('filters by typeCodes', () => {
    expect(ids(applyInspectionScope(comps, { typeCodes: ['door'] }, ctx))).toEqual(['c1', 'c3']);
  });

  it('filters by systemIds (via type building_system_id)', () => {
    expect(ids(applyInspectionScope(comps, { systemIds: ['elec'] }, ctx))).toEqual(['c2']);
  });

  it('filters by floorIds', () => {
    expect(ids(applyInspectionScope(comps, { floorIds: ['fX'] }, ctx))).toEqual(['c3']);
  });

  it('filters by statuses', () => {
    expect(ids(applyInspectionScope(comps, { statuses: ['failed', 'problem'] }, ctx))).toEqual(['c2', 'c3']);
  });

  it('combines criteria (AND across dimensions)', () => {
    expect(ids(applyInspectionScope(comps, { typeCodes: ['door'], statuses: ['problem'] }, ctx))).toEqual(['c3']);
  });

  it('handles null components safely', () => {
    expect(applyInspectionScope(null, { typeCodes: ['door'] }, ctx)).toEqual([]);
  });
});

describe('scopeToCriteria', () => {
  it('maps floorIds to a custom preset', () => {
    expect(scopeToCriteria({ floorIds: ['fX'] }).floorPreset).toBe('custom');
  });
  it('maps empty scope to the all preset', () => {
    expect(scopeToCriteria({}).floorPreset).toBe('all');
  });
});

describe('isEmptyScope', () => {
  it('true for no constraints', () => {
    expect(isEmptyScope({})).toBe(true);
    expect(isEmptyScope({ typeCodes: [] })).toBe(true);
  });
  it('false when any dimension is set', () => {
    expect(isEmptyScope({ typeCodes: ['door'] })).toBe(false);
    expect(isEmptyScope({ conditionAttrFilters: [{ name: 'x', value: 'y' }] })).toBe(false);
  });
});
