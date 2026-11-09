import { describe, it, expect } from 'vitest';
import { sortComponentList } from './componentListSort.js';

const floors = [
  { id: 'f1', short_name: '1', level_order: 1 },
  { id: 'fG', short_name: 'G', level_order: 0 },
];
const systems = [{ id: 's-fire', presentation_order: 1 }, { id: 's-light', presentation_order: 2 }];
const types = [
  { code: 'door', initial: 'A', building_system_id: 's-fire' },
  { code: 'light', initial: 'L', building_system_id: 's-light' },
];
const ctx = { floors, types, systems };
const c = (id, floor_id, type_code, asset_id, label, inspection_sort_order = null) => ({ id, floor_id, type_code, asset_id, label, inspection_sort_order });
const list = [
  c('a', 'f1', 'door', '10', '10'),
  c('b', 'fG', 'light', '02', 'L2', 1),
  c('d', 'fG', 'door', '02', '9', 2),
  c('e', 'fG', 'door', '01', null, 1),
  c('f', 'f1', 'door', '02', '12a'),
];
const ids = (xs) => xs.map((x) => x.id);

describe('sortComponentList', () => {
  it('walk order is the table’s old order: floor, system, walk order, asset id', () => {
    expect(ids(sortComponentList(list, {}, ctx))).toEqual(['e', 'd', 'b', 'f', 'a']);
  });
  it('ref order: floor in building order, then initial, then asset id as a number', () => {
    expect(ids(sortComponentList(list, { key: 'ref' }, ctx))).toEqual(['e', 'd', 'b', 'f', 'a']);
    expect(ids(sortComponentList(list, { key: 'ref', dir: 'desc' }, ctx))).toEqual(['a', 'f', 'b', 'd', 'e']);
  });
  it('label order is numeric (9 before 10 before 12a), with no label last either way', () => {
    expect(ids(sortComponentList(list, { key: 'label' }, ctx))).toEqual(['d', 'a', 'f', 'b', 'e']);
    expect(ids(sortComponentList(list, { key: 'label', dir: 'desc' }, ctx))).toEqual(['b', 'f', 'a', 'd', 'e']);
  });
  it('does not change the list it is given', () => {
    const copy = [...list];
    sortComponentList(list, { key: 'label' }, ctx);
    expect(list).toEqual(copy);
  });
});
