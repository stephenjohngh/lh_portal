// src/lib/apps/parking/stores/parkingStore.test.js
// Store contract: which calls load and saveBay make, and what state results.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    upsert: vi.fn(),
  },
  listParkingBaySpaces: vi.fn(),
  logAudit: vi.fn(),
  auth: {
    subscribe(fn) { fn({ user: { id: 'u1' } }); return () => {}; },
  },
}));

vi.mock('$lib/utils/api', () => ({ api: h.api }));
vi.mock('$lib/stores/auth', () => ({ auth: h.auth }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$lib/apps/building_assets/public.js', () => ({ listParkingBaySpaces: h.listParkingBaySpaces }));

const { parkingStore } = await import('./parkingStore.js');

const floors = [{ id: 'L', short_name: 'L', level_order: 1 }];
const spaces = [{ id: 's22', kind: 'slot', floor_id: 'L', plan_id: 'p', type: 'Car', assigned_id: '22', polygon: [] }];

beforeEach(() => {
  vi.clearAllMocks();
  h.listParkingBaySpaces.mockResolvedValue(spaces);
  h.api.get.mockImplementation(async (table) => ({
    parking_bays: [], floors, plans: [],
  })[table] ?? []);
});

describe('load', () => {
  // The drawn bays are Building Assets' records: they come through its
  // public.js, never from a direct read of `spaces`.
  it('reads bays through Building Assets, and never reads spaces directly', async () => {
    await parkingStore.load();
    expect(h.listParkingBaySpaces).toHaveBeenCalled();
    expect(h.api.get.mock.calls.map(c => c[0])).not.toContain('spaces');
    const s = get(parkingStore);
    expect(s.bays).toHaveLength(1);
    expect(s.bays[0].ref).toBe('L/PK/22');
  });
});

describe('saveBay', () => {
  it('upserts on the drawn space and marks the first save as created by the user', async () => {
    await parkingStore.load();
    h.api.upsert.mockResolvedValue({ id: 'b1', space_id: 's22', tenure: 'not_for_allocation', in_service: true });
    await parkingStore.saveBay('s22', { tenure: 'not_for_allocation' });
    const [table, row, opts] = h.api.upsert.mock.calls[0];
    expect(table).toBe('parking_bays');
    expect(opts).toEqual({ onConflict: 'space_id' });
    expect(row).toMatchObject({ space_id: 's22', created_by: 'u1', updated_by: 'u1' });
    expect(get(parkingStore).bays[0].state).toBe('not_for_allocation');
    expect(h.logAudit).toHaveBeenCalledWith('create', 'parking_bay', 'b1', 'L/PK/22', expect.anything());
  });

  it('refuses an edit the database would refuse, before writing anything', async () => {
    await parkingStore.load();
    await expect(parkingStore.saveBay('s22', { tenure: 'demised', unit_ref: '' }))
      .rejects.toThrow(/flat/);
    expect(h.api.upsert).not.toHaveBeenCalled();
  });
});
