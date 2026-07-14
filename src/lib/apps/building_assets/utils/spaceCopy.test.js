// src/lib/apps/building_assets/utils/spaceCopy.test.js
import { describe, it, expect } from 'vitest';
import { buildSpaceCopyRows, targetSpaceGuards } from './spaceCopy.js';

const poly = n => [{ x: n, y: 0 }, { x: n + 0.1, y: 0 }, { x: n + 0.1, y: 0.1 }, { x: n, y: 0.1 }];

const src = [
  { id: 'a', plan_id: 'src', floor_id: 'fG', kind: 'space', assigned_id: '12', name: 'Plant', type: 'Plant Room', polygon: poly(0.1), colour: '3c9683', height_m: 2.8, show_label: true, notes: 'n' },
  { id: 'b', plan_id: 'src', floor_id: 'fG', kind: 'slot',  assigned_id: '01', name: 'Bay',   type: 'Car Park',   polygon: poly(0.3), colour: 'none' },
  { id: 'c', plan_id: 'src', floor_id: 'fG', kind: 'space', assigned_id: null, name: 'Lobby', type: null,          polygon: poly(0.5), colour: 'blue' },
];

describe('targetSpaceGuards', () => {
  it('collects taken (kind|assigned_id) on the target floor and polygon sigs on the target plan', () => {
    const all = [
      { plan_id: 'tgt', floor_id: 'f1', kind: 'space', assigned_id: '12', polygon: poly(0.1) },
      { plan_id: 'other', floor_id: 'f1', kind: 'slot', assigned_id: '99', polygon: poly(9) },
    ];
    const { takenRefs, existingSig } = targetSpaceGuards(all, 'tgt', 'f1');
    expect(takenRefs.has('space|12')).toBe(true);
    expect(takenRefs.has('slot|99')).toBe(true);          // same floor, any plan
    expect(existingSig.has(JSON.stringify(poly(0.1)))).toBe(true);   // on target plan
    expect(existingSig.has(JSON.stringify(poly(9)))).toBe(false);    // different plan
  });
});

describe('buildSpaceCopyRows', () => {
  it('copies to the target plan/floor, preserving fields incl. kind + type', () => {
    const rows = buildSpaceCopyRows(src, { planId: 'tgt', floorId: 'f1', userId: 'u1' });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      plan_id: 'tgt', floor_id: 'f1', name: 'Plant', type: 'Plant Room',
      kind: 'space', assigned_id: '12', height_m: 2.8, created_by: 'u1', updated_by: 'u1',
    });
    expect(rows[1]).toMatchObject({ kind: 'slot', assigned_id: '01', colour: 'none' });
    expect(rows[2].assigned_id).toBe(null);
  });

  it('blanks assigned_id when it already exists on the target floor (same kind)', () => {
    const takenRefs = new Set(['space|12']);   // a Space 12 already on the target floor
    const rows = buildSpaceCopyRows(src, { planId: 'tgt', floorId: 'f1', userId: 'u1', takenRefs });
    expect(rows[0].assigned_id).toBe(null);    // 'space|12' clashed → blanked
    expect(rows[1].assigned_id).toBe('01');    // 'slot|01' is free → kept
  });

  it('skips spaces whose polygon already exists on the target plan (idempotent re-copy)', () => {
    const existingSig = new Set([JSON.stringify(poly(0.1)), JSON.stringify(poly(0.3))]);
    const rows = buildSpaceCopyRows(src, { planId: 'tgt', floorId: 'f1', userId: 'u1', existingSig });
    expect(rows.map(r => r.name)).toEqual(['Lobby']);   // only the not-yet-present one
  });
});
