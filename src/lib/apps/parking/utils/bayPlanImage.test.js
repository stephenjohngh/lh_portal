// src/lib/apps/parking/utils/bayPlanImage.test.js
// What each bay says on the caretaker's printed plan. (The canvas drawing is
// browser-only and not tested here; the labels and the list are.)
import { describe, it, expect, vi } from 'vitest';

vi.mock('#lib/utils/authHeaders.js', () => ({ authHeaders: async () => ({}) }));
vi.mock('#lib/utils/download.js', () => ({ downloadResponse: vi.fn() }));

const { bayPlanLabel, bayPlanRows } = await import('./bayPlanImage.js');

const holders = [
  { id: 'h1', display_name: 'Alice Example' },
  { id: 'h2', display_name: 'Bob', company_name: 'A Very Long Company Name Limited' },
];

describe('bayPlanLabel', () => {
  it('shows who has an allocated bay, and FREE for an empty one', () => {
    expect(bayPlanLabel({ number: '22', state: 'allocated', current: { holder_id: 'h1' } }, holders))
      .toEqual({ number: '22', who: 'Alice Example' });
    expect(bayPlanLabel({ number: '25', state: 'free' }, holders)).toEqual({ number: '25', who: 'FREE' });
  });
  it('shortens a long name so it fits on a bay', () => {
    const { who } = bayPlanLabel({ number: '1', state: 'allocated', current: { holder_id: 'h2' } }, holders);
    expect(who.length).toBeLessThanOrEqual(18);
    expect(who.endsWith('…')).toBe(true);
  });
  it('shows a demised bay by its flat, with the holder when recorded', () => {
    const bay = { number: '3', state: 'demised', bay_id: 'b3', unit_ref: 'Flat 12' };
    expect(bayPlanLabel(bay, holders, []).who).toBe('Flat 12');
    expect(bayPlanLabel(bay, holders, [{ bay_id: 'b3', status: 'active', holder_id: 'h1' }]).who)
      .toBe('Flat 12 · Alice Example');
  });
  it('says so when a bay is out of use or offered', () => {
    expect(bayPlanLabel({ number: '4', state: 'out_of_use' }).who).toBe('OUT OF USE');
    expect(bayPlanLabel({ number: '5', state: 'offered' }).who).toBe('Offered');
  });
});

describe('bayPlanRows', () => {
  it('lists every bay with its holder and current vehicles, and Free for an empty one', () => {
    const bays = [
      { ref: 'L/PK/22', size: 'Car', state: 'allocated', bay_id: 'b1', current: { id: 'a1', holder_id: 'h1' } },
      { ref: 'L/PK/25', size: 'Large car', state: 'free', bay_id: 'b2' },
    ];
    const vehicles = [{ agreement_id: 'a1', registration: 'AB12CDE', to_date: null },
                      { agreement_id: 'a1', registration: 'OLD123', to_date: '2026-01-01' }];
    const rows = bayPlanRows(bays, holders, [], vehicles);
    expect(rows[0]).toEqual(['L/PK/22', 'Car', 'Allocated', 'Alice Example', 'AB12CDE']);
    expect(rows[1]).toEqual(['L/PK/25', 'Large car', 'Free', 'Free', '']);
  });
});

describe('a reserved bay on the plan', () => {
  it('names who has it from later, and is never printed FREE', () => {
    expect(bayPlanLabel({ number: '7', state: 'reserved', reserved: { holder_id: 'h1' } }, holders))
      .toEqual({ number: '7', who: 'Alice Example' });
    expect(bayPlanLabel({ number: '8', state: 'reserved', reserved: {} }, holders).who).toBe('Reserved');
  });
});
