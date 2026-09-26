// src/lib/apps/parking/stores/parkingStore.test.js
// Store contract: which calls each method makes, and what state results.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({
  api: {
    get: vi.fn(), getAll: vi.fn(), upsert: vi.fn(),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  },
  listParkingBaySpaces: vi.fn(),
  logAudit: vi.fn(),
  auth: { subscribe(fn) { fn({ user: { id: 'u1' } }); return () => {}; } },
}));

vi.mock('$lib/utils/api', () => ({ api: h.api }));
vi.mock('$lib/stores/auth', () => ({ auth: h.auth }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$lib/apps/building_assets/public.js', () => ({ listParkingBaySpaces: h.listParkingBaySpaces }));

const { parkingStore } = await import('./parkingStore.js');

const floors = [{ id: 'L', short_name: 'L', level_order: 1 }];
const spaces = [{ id: 's22', kind: 'slot', floor_id: 'L', plan_id: 'p', type: 'Car', assigned_id: '22', polygon: [] }];
const holder = { id: 'h1', holder_type: 'leaseholder', display_name: 'Alice Example', email: 'a@example.com' };

let tables;
beforeEach(() => {
  vi.clearAllMocks();
  tables = { parking_bays: [], floors, plans: [], parking_holders: [holder], parking_agreements: [], parking_vehicles: [] };
  h.listParkingBaySpaces.mockResolvedValue(spaces);
  h.api.get.mockImplementation(async (t) => tables[t] ?? []);
  h.api.getAll.mockImplementation(async (t) => tables[t] ?? []);
  h.api.create.mockImplementation(async (t, row) => ({ id: `${t}-new`, reference: 'PA-0001', ...row }));
  h.api.update.mockImplementation(async (t, id, patch) => ({ id, ...patch }));
});

describe('load', () => {
  // The drawn bays are Building Assets' records: they come through its
  // public.js, never from a direct read of `spaces`.
  it('reads bays through Building Assets, and never reads spaces directly', async () => {
    await parkingStore.load();
    expect(h.listParkingBaySpaces).toHaveBeenCalled();
    const read = [...h.api.get.mock.calls, ...h.api.getAll.mock.calls].map(c => c[0]);
    expect(read).not.toContain('spaces');
    expect(get(parkingStore).bays[0].ref).toBe('L/PK/22');
  });
});

describe('saveBay', () => {
  it('upserts on the drawn space and refuses an edit the database would refuse', async () => {
    await parkingStore.load();
    h.api.upsert.mockResolvedValue({ id: 'b1', space_id: 's22', tenure: 'not_for_allocation', in_service: true });
    await parkingStore.saveBay('s22', { tenure: 'not_for_allocation' });
    expect(h.api.upsert.mock.calls[0][2]).toEqual({ onConflict: 'space_id' });
    expect(get(parkingStore).bays[0].state).toBe('not_for_allocation');

    await expect(parkingStore.saveBay('s22', { tenure: 'demised', unit_ref: '' })).rejects.toThrow(/flat/);
    expect(h.api.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('createAgreement', () => {
  it('creates the bay row first if the bay was only ever drawn, then a DRAFT, then its vehicles', async () => {
    await parkingStore.load();
    h.api.upsert.mockResolvedValue({ id: 'b1', space_id: 's22', tenure: 'licensable', in_service: true });
    await parkingStore.createAgreement('s22', 'h1',
      { basis: 'licence', starts_on: '2026-10-01', max_vehicles: 1 },
      [{ registration: 'ab12 cde' }]);

    expect(h.api.upsert).toHaveBeenCalled();                       // the bay row
    const ag = h.api.create.mock.calls.find(c => c[0] === 'parking_agreements')[1];
    expect(ag).toMatchObject({ bay_id: 'b1', holder_id: 'h1', status: 'draft', created_by: 'u1' });
    const veh = h.api.create.mock.calls.find(c => c[0] === 'parking_vehicles')[1];
    expect(veh.registration).toBe('AB12CDE');
  });

  it('refuses before writing anything when the rules say no', async () => {
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'demised', unit_ref: 'Flat 1' }];
    await parkingStore.load();
    await expect(parkingStore.createAgreement('s22', 'h1', { basis: 'licence', starts_on: '2026-10-01' }))
      .rejects.toThrow(/recorded/);
    expect(h.api.create).not.toHaveBeenCalled();
  });
});

describe('setStatus', () => {
  it('ending an agreement ends its vehicles the same day, and refuses a backwards move', async () => {
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_agreements = [{ id: 'a1', reference: 'PA-0001', bay_id: 'b1', holder_id: 'h1',
      basis: 'licence', status: 'active', starts_on: '2026-01-01', ends_on: null }];
    tables.parking_vehicles = [{ id: 'v1', agreement_id: 'a1', registration: 'AB12CDE', to_date: null }];
    await parkingStore.load();

    await parkingStore.setStatus('a1', 'ended', { ends_on: '2026-09-30', ended_reason: 'Moved out' });
    expect(h.api.update).toHaveBeenCalledWith('parking_agreements', 'a1',
      expect.objectContaining({ status: 'ended', ends_on: '2026-09-30' }), true);
    expect(h.api.update).toHaveBeenCalledWith('parking_vehicles', 'v1', { to_date: '2026-09-30' }, true);

    await expect(parkingStore.setStatus('a1', 'active')).rejects.toThrow(/cannot go/);
  });
});

// ⚠ The portal-wide audit log is readable far more widely than the parking
// tables. Nothing written there may carry a holder's personal details.
describe('the audit log never carries personal details', () => {
  it('a holder save logs the change, not the name, email or address', async () => {
    await parkingStore.load();
    await parkingStore.saveHolder(null, { holder_type: 'leaseholder', display_name: 'Bob Private',
      email: 'bob@example.com', correspondence_address: '1 Secret Street' });
    const logged = JSON.stringify(h.logAudit.mock.calls);
    for (const s of ['Bob Private', 'bob@example.com', 'Secret Street']) expect(logged).not.toContain(s);
  });

  it('a registration lookup is logged, without the holder it found', async () => {
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_agreements = [{ id: 'a1', reference: 'PA-0001', bay_id: 'b1', holder_id: 'h1',
      basis: 'licence', status: 'active', starts_on: '2026-01-01' }];
    tables.parking_vehicles = [{ id: 'v1', agreement_id: 'a1', registration: 'AB12CDE', to_date: null }];
    await parkingStore.load();
    h.logAudit.mockClear();

    const hits = parkingStore.lookupRegistration('ab12');
    expect(hits[0].holder.display_name).toBe('Alice Example');
    expect(h.logAudit).toHaveBeenCalledWith('view', 'parking_vehicle', null, 'registration lookup',
      expect.objectContaining({ afterData: { query: 'AB12', results: 1 } }));
    expect(JSON.stringify(h.logAudit.mock.calls)).not.toContain('Alice');
  });
});
