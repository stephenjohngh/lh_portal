import { describe, it, expect } from 'vitest';
import { scanProfileFor, jumpCandidates, jumpIndexFor } from './scanFields.js';
import { matchScan } from '#lib/utils/textScan/scanMatch.js';

const FLOORS = [{ id: 'f0', short_name: 'G' }, { id: 'f1', short_name: '1' }];
const TYPES = [{ code: 'door_fire_door', initial: 'F' }];
const WALK = [
  { id: 'a', type_code: 'door_fire_door', floor_id: 'f0', asset_id: 'FD-042', label: '12' },
  { id: 'b', type_code: 'door_fire_door', floor_id: 'f1', asset_id: 'FD-101', label: '12' },
  { id: 'c', type_code: 'door_fire_door', floor_id: 'f1', asset_id: null,     label: 'Riser 3' },
];

describe('which fields scan, and as what', () => {
  it('a number reads as a reading, text as a code, a choice or prose not at all', () => {
    expect(scanProfileFor('number')).toBe('reading');
    expect(scanProfileFor('text')).toBe('code');
    expect(scanProfileFor(undefined)).toBe('code');      // the editor's text fallback
    for (const t of ['checkbox', 'radio', 'dropdown', 'textarea']) expect(scanProfileFor(t)).toBeNull();
  });
});

describe('scanning in the Jump list', () => {
  const cands = jumpCandidates(WALK, FLOORS, TYPES);

  it('offers both doors numbered 12, each with its own ref', () => {
    const m = matchScan('12', cands, 'code');
    expect(m.map((x) => x.label).sort()).toEqual(['1/F/FD-101', 'G/F/FD-042']);
    expect(m.map((x) => x.index).sort()).toEqual([0, 1]);
  });

  it('an asset tag finds its component, allowing for a misread letter', () => {
    const m = matchScan('FD-O42', cands, 'code');
    expect(m[0]).toMatchObject({ value: 'FD-042', index: 0 });
  });

  it('a value used as read jumps only when it is exactly a number on this walk', () => {
    expect(jumpIndexFor('riser 3', cands)).toBe(2);
    expect(jumpIndexFor('FD-999', cands)).toBeNull();
  });
});
