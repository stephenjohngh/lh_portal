// src/lib/apps/parking/utils/bayModel.test.js
import { describe, it, expect } from 'vitest';
import {
  mergeBays, bayState, baySize, measureBay, baySummary, filterBays,
  validateBayFacts, bayFactsRow, BAY_DEFAULTS, BAY_STATES,
} from './bayModel.js';

const floors = [
  { id: 'U', short_name: 'U', level_order: 1 },
  { id: 'L', short_name: 'L', level_order: 2 },
];
// A 0.1 × 0.2 rectangle on a square plan whose scale line is 0.1 units = 2 m,
// so the bay measures 2 m × 4 m = 8 m².
const plans = [{ id: 'pL', image_aspect_ratio: 1, scale_ref: { x1: 0, y1: 0, x2: 0.1, y2: 0, metres: 2 } }];
const rect = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.2 }, { x: 0, y: 0.2 }];
const space = (id, over = {}) => ({
  id, kind: 'slot', floor_id: 'L', plan_id: 'pL', type: 'Car', assigned_id: null, polygon: rect, ...over,
});

describe('mergeBays', () => {
  it('a drawn bay with no parking row is still a bay, with the defaults', () => {
    const [b] = mergeBays([space('s1', { assigned_id: '22' })], [], floors, plans);
    expect(b.bay_id).toBeNull();
    expect(b.tenure).toBe(BAY_DEFAULTS.tenure);
    expect(b.in_service).toBe(true);
    expect(b.state).toBe('free');
    expect(b.ref).toBe('L/PK/22');
  });

  it('takes the parking facts from the row that names the space', () => {
    const [b] = mergeBays([space('s1')],
      [{ id: 'b1', space_id: 's1', tenure: 'demised', unit_ref: 'Flat 12' }], floors, plans);
    expect(b.bay_id).toBe('b1');
    expect(b.unit_ref).toBe('Flat 12');
    expect(b.state).toBe('demised');
  });

  it('orders by level, then bay number numerically, unnumbered last', () => {
    const out = mergeBays([
      space('a', { assigned_id: '100' }),
      space('b', { assigned_id: null }),
      space('c', { assigned_id: '9' }),
      space('d', { floor_id: 'U', assigned_id: '50' }),
    ], [], floors, plans);
    expect(out.map(b => b.space_id)).toEqual(['d', 'c', 'a', 'b']);
  });
});

describe('bayState', () => {
  it('out of use wins over every tenure', () => {
    for (const tenure of ['licensable', 'demised', 'lease_right', 'not_for_allocation']) {
      expect(bayState({ tenure, in_service: false })).toBe('out_of_use');
    }
  });
  it('a demised bay and a lease right both read as belonging to a flat', () => {
    expect(bayState({ tenure: 'demised', in_service: true })).toBe('demised');
    expect(bayState({ tenure: 'lease_right', in_service: true })).toBe('demised');
  });
  it('every state it returns has a label and colour', () => {
    const known = new Set(BAY_STATES.map(s => s.value));
    for (const b of [{ in_service: false }, { tenure: 'demised' }, { tenure: 'not_for_allocation' }, { tenure: 'licensable' }]) {
      expect(known.has(bayState(b))).toBe(true);
    }
  });
});

describe('baySize', () => {
  it('is the Type when it is a bay size, and nothing otherwise', () => {
    expect(baySize({ type: 'Bicycle' })).toBe('Bicycle');
    expect(baySize({ type: 'Car Park' })).toBeNull();   // a room type, not a size
    expect(baySize({ type: null })).toBeNull();
  });
});

describe('measureBay', () => {
  it('measures width, length and area from the drawing', () => {
    const m = measureBay(space('s1'), plans[0]);
    expect(m.width).toBeCloseTo(2);
    expect(m.length).toBeCloseTo(4);
    expect(m.area).toBeCloseTo(8);
  });
  it('says nothing, rather than guessing, when the plan has no scale', () => {
    expect(measureBay(space('s1'), { image_aspect_ratio: 1, scale_ref: null })).toBeNull();
  });
});

describe('baySummary and filterBays', () => {
  const bays = mergeBays([
    space('a', { assigned_id: '1', type: 'Car' }),
    space('b', { assigned_id: '2', type: 'Bicycle' }),
    space('c', { assigned_id: null, type: 'Car Park' }),
  ], [{ id: 'x', space_id: 'b', in_service: false, out_of_use_reason: 'Leak' }], floors, plans);

  it('counts by state and size, and the two setup gaps', () => {
    const s = baySummary(bays);
    expect(s.total).toBe(3);
    expect(s.byState.out_of_use).toBe(1);
    expect(s.byState.free).toBe(2);
    expect(s.bySize.Car).toBe(1);
    expect(s.unsized).toBe(1);
    expect(s.unnumbered).toBe(1);
  });

  it('filters by size, a missing size, state and text', () => {
    expect(filterBays(bays, { size: 'Bicycle' }).map(b => b.space_id)).toEqual(['b']);
    expect(filterBays(bays, { size: '__none' }).map(b => b.space_id)).toEqual(['c']);
    expect(filterBays(bays, { state: 'out_of_use' }).map(b => b.space_id)).toEqual(['b']);
    expect(filterBays(bays, { q: 'l/pk/2' }).map(b => b.space_id)).toEqual(['b']);
    expect(filterBays(bays, {})).toHaveLength(3);
  });
});

describe('validateBayFacts and bayFactsRow', () => {
  it('a demised bay must name its flat, and an out-of-use bay its reason', () => {
    expect(validateBayFacts({ tenure: 'demised', unit_ref: ' ' })).toMatch(/flat/);
    expect(validateBayFacts({ tenure: 'licensable', in_service: false })).toMatch(/why/);
    expect(validateBayFacts({ tenure: 'licensable', max_height_m: '-1' })).toMatch(/Headroom/);
    expect(validateBayFacts({ tenure: 'demised', unit_ref: 'Flat 3' })).toBeNull();
  });

  it('drops a unit when the tenure no longer names a lease, and the reason when back in service', () => {
    const row = bayFactsRow({ tenure: 'licensable', unit_ref: 'Flat 3', in_service: true,
      out_of_use_reason: 'Leak', out_of_use_until: '2026-10-01', max_height_m: '2.1' });
    expect(row.unit_ref).toBeNull();
    expect(row.out_of_use_reason).toBeNull();
    expect(row.out_of_use_until).toBeNull();
    expect(row.max_height_m).toBe(2.1);
  });

  // The drawing belongs to Building Assets. An edit here must never carry the
  // bay's size, number, name or shape into the parking row.
  it('writes only parking facts, never anything that belongs to the drawing', () => {
    const row = bayFactsRow({ tenure: 'licensable', type: 'Car', assigned_id: '9', polygon: rect, name: 'x' });
    for (const k of ['type', 'assigned_id', 'polygon', 'name', 'space_id', 'floor_id']) {
      expect(row).not.toHaveProperty(k);
    }
  });
});

// A bay held by a draft, or by a licence starting later, read as Free — and
// printed FREE on the caretaker's plan (review 2026-09-27).
describe('reserved', () => {
  it('a bay with a draft or a later licence is Reserved, not Free', async () => {
    const { bayState } = await import('./bayModel.js');
    expect(bayState({ in_service: true, tenure: 'licensable', reserved: { id: 'x' } })).toBe('reserved');
    expect(bayState({ in_service: true, tenure: 'licensable' })).toBe('free');
    // Out of use still wins, and so does a licence covering today.
    expect(bayState({ in_service: false, tenure: 'licensable', reserved: { id: 'x' } })).toBe('out_of_use');
    expect(bayState({ in_service: true, tenure: 'licensable', current: { basis: 'licence' }, reserved: { id: 'x' } })).toBe('allocated');
  });
});
