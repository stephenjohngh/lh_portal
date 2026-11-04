import { describe, it, expect } from 'vitest';
import { toFloorGroups, floorGroupOptions, floorGroupOf, floorGroupLabel, floorGroupProblem } from './floorGroups.js';

const rows = [
  { id: 'b', name: 'Basement', position: 20, floor_group_floors: [{ floor_id: 'fU' }, { floor_id: 'fL' }] },
  { id: 'r', name: 'Residential', position: 10, floor_group_floors: [{ floor_id: 'fG' }] },
  { id: 'e', name: 'External', position: 30, floor_group_floors: [] },
];
const floors = [{ id: 'fL', short_name: 'L' }, { id: 'fU', short_name: 'U' }, { id: 'fG', short_name: 'G' }];
const groups = toFloorGroups(rows);

describe('floor groups', () => {
  it('reads groups in their order, with their floors', () => {
    expect(groups.map((g) => g.name)).toEqual(['Residential', 'Basement', 'External']);
    expect(groups[1].floorIds).toEqual(['fU', 'fL']);
  });

  it('the buttons are All and each group with floors; an empty group is not offered', () => {
    expect(floorGroupOptions(groups)).toEqual([
      { value: 'all', label: 'All' }, { value: 'r', label: 'Residential' }, { value: 'b', label: 'Basement' },
    ]);
    expect(floorGroupOptions([])).toEqual([{ value: 'all', label: 'All' }]);
  });

  it('finds the group a filter names; all, custom and a deleted group name none', () => {
    expect(floorGroupOf('b', groups).name).toBe('Basement');
    expect(floorGroupOf('all', groups)).toBeNull();
    expect(floorGroupOf('custom', groups)).toBeNull();
    expect(floorGroupOf('gone', groups)).toBeNull();
  });

  it('labels a group with its floors in building order', () => {
    expect(floorGroupLabel(groups[1], floors)).toBe('Basement (L, U)');
    expect(floorGroupLabel(groups[2], floors)).toBe('External');
  });

  it('refuses no name, the word All, and a name already used, ignoring case', () => {
    expect(floorGroupProblem(' ', null, groups)).toMatch(/needs a name/);
    expect(floorGroupProblem('all', null, groups)).toMatch(/already a button/);
    expect(floorGroupProblem('basement', null, groups)).toMatch(/already a group/);
    expect(floorGroupProblem('Basement', 'b', groups)).toBe('');
    expect(floorGroupProblem('Garden', null, groups)).toBe('');
  });
});
