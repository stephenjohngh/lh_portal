// src/lib/apps/building_assets/utils/spaceReport.test.js
import { describe, it, expect } from 'vitest';
import {
  spaceRollup, spaceMembersCsvRows, buildRegisterRow, spacesRegisterCsvRows,
} from './spaceReport.js';

const floors = [{ id: 'f1', short_name: 'G' }];
const types  = [{ code: 'fd', initial: 'FD', name: 'Fire Door' }];
const space  = { id: 's1', kind: 'space', floor_id: 'f1', assigned_id: '12', name: 'Plant Room', usage: 'Plant Room' };
const members = [
  { id: 'c1', floor_id: 'f1', type_code: 'fd', asset_id: 'FD-1', status: 'ok',      label: 'Door A' },
  { id: 'c2', floor_id: 'f1', type_code: 'fd', asset_id: 'FD-2', status: 'failed',  label: null },
  { id: 'c3', floor_id: 'f1', type_code: 'fd', asset_id: 'FD-3', status: 'ok',      label: null },
];

describe('spaceRollup', () => {
  it('counts members by status', () => {
    const r = spaceRollup(members);
    expect(r.total).toBe(3);
    expect(r.byStatus).toEqual({ ok: 2, problem: 0, failed: 1, inactive: 0 });
  });
  it('handles an empty list', () => {
    expect(spaceRollup([])).toEqual({ total: 0, byStatus: { ok: 0, problem: 0, failed: 0, inactive: 0 } });
  });
});

describe('spaceMembersCsvRows', () => {
  it('emits a header and one escaped row per member', () => {
    const rows = spaceMembersCsvRows(space, members, floors, types);
    expect(rows[0]).toBe('Space Ref,Space Name,Component Ref,Type,Label,Status');
    expect(rows).toHaveLength(4);
    expect(rows[1]).toBe('G/S/12,Plant Room,G/FD/FD-1,Fire Door,Door A,OK');
  });
});

describe('buildRegisterRow / spacesRegisterCsvRows', () => {
  it('assembles a register row with rollup + supplied area', () => {
    const row = buildRegisterRow(space, members, floors, { area_m2: 42.35 });
    expect(row).toMatchObject({
      reference: 'G/S/12', name: 'Plant Room', kind: 'space', usage: 'Plant Room',
      floor: 'G', area_m2: 42.35, total: 3, ok: 2, failed: 1, problem: 0, inactive: 0,
    });
  });
  it('serialises register rows to CSV (area rounded, blank when null)', () => {
    const rows = spacesRegisterCsvRows([
      buildRegisterRow(space, members, floors, { area_m2: 42.35 }),
      buildRegisterRow({ ...space, id: 's2', assigned_id: '13', name: 'Lobby', usage: '' }, [], floors, {}),
    ]);
    expect(rows[0]).toBe('Reference,Name,Kind,Usage,Floor,Area m2,Components,OK,Problem,Failed,Inactive');
    expect(rows[1]).toBe('G/S/12,Plant Room,space,Plant Room,G,42.4,3,2,0,1,0');
    expect(rows[2]).toBe('G/S/13,Lobby,space,,G,,0,0,0,0,0');
  });
});
