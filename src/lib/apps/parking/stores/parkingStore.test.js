// src/lib/apps/parking/stores/parkingStore.test.js
// Store contract: which calls each method makes, and what state results.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({
  api: {
    get: vi.fn(), getAll: vi.fn(), upsert: vi.fn(),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), rpc: vi.fn(),
  },
  listParkingBaySpaces: vi.fn(),
  logAudit: vi.fn(),
  postJson: vi.fn(),
  deleteDocumentsFor: vi.fn(() => Promise.resolve(0)),
  auth: { subscribe(fn) { fn({ user: { id: 'u1' } }); return () => {}; } },
}));

vi.mock('#lib/utils/api.js', () => ({ api: h.api }));
vi.mock('#lib/stores/auth.js', () => ({ auth: h.auth }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: h.logAudit }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('#lib/apps/building_assets/public.js', () => ({ listParkingBaySpaces: h.listParkingBaySpaces }));
vi.mock('#lib/utils/request.js', () => ({ postJson: h.postJson }));
vi.mock('#lib/utils/documentApi.js', () => ({ deleteDocumentsFor: h.deleteDocumentsFor }));

const { parkingStore } = await import('./parkingStore.js');

const floors = [{ id: 'L', short_name: 'L', level_order: 1 }];
const spaces = [{ id: 's22', kind: 'slot', floor_id: 'L', schematic_id: 'p', type: 'Car', assigned_id: '22', polygon: [] }];
const holder = { id: 'h1', holder_type: 'leaseholder', display_name: 'Alice Example', email: 'a@example.com' };

let tables;
beforeEach(() => {
  vi.clearAllMocks();
  tables = { parking_bays: [], floors, plans: [], parking_holders: [holder], parking_agreements: [],
    parking_vehicles: [], parking_access_devices: [], parking_events: [] };
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
      expect.objectContaining({ afterData: { query: 'AB12', results: 1, permitResults: 0 } }));
    expect(JSON.stringify(h.logAudit.mock.calls)).not.toContain('Alice');
  });
});

// ── Phase 2 ────────────────────────────────────────────────────────────────

const activeAg = { id: 'a1', reference: 'PA-0001', bay_id: 'b1', holder_id: 'h1', basis: 'licence',
  status: 'active', starts_on: '2026-01-01', ends_on: null, notice_days: 28, deposit_amount: 25 };

describe('notice', () => {
  it('serving notice keeps the old end date so withdrawing it restores the agreement exactly', async () => {
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_agreements = [activeAg];
    await parkingStore.load();

    await parkingStore.serveNotice('a1', { served_on: '2026-10-01', served_by: 'holder', ends_on: '2026-10-29' });
    expect(h.api.update).toHaveBeenLastCalledWith('parking_agreements', 'a1', expect.objectContaining({
      status: 'notice_given', notice_served_on: '2026-10-01', ends_on: '2026-10-29', ends_on_before_notice: null,
    }), true);

    // The mock returns only the patch, so give the state back what the row now holds.
    tables.parking_agreements = [{ ...activeAg, status: 'notice_given', ends_on: '2026-10-29', ends_on_before_notice: null }];
    await parkingStore.load();
    await parkingStore.setStatus('a1', 'active');        // routed to withdrawNotice
    expect(h.api.update).toHaveBeenLastCalledWith('parking_agreements', 'a1', expect.objectContaining({
      status: 'active', ends_on: null, notice_served_on: null,
    }), true);
  });

  it('will not move to notice without its date and who served it', async () => {
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_agreements = [activeAg];
    await parkingStore.load();
    await expect(parkingStore.setStatus('a1', 'notice_given')).rejects.toThrow(/Serve notice/);
  });
});

describe('devices and the deposit', () => {
  it('refuses to refund a deposit while a device is out, and a serial already out', async () => {
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_agreements = [activeAg];
    tables.parking_access_devices = [{ id: 'd1', agreement_id: 'a1', device_type: 'fob', serial: 'F-1', issued_on: '2026-01-01', returned_on: null }];
    await parkingStore.load();
    await expect(parkingStore.refundDeposit('a1')).rejects.toThrow(/not been returned/);
    await expect(parkingStore.issueDevice('a1', { device_type: 'fob', serial: 'f-1' })).rejects.toThrow(/still out/);
    expect(h.api.update).not.toHaveBeenCalled();
    expect(h.api.create).not.toHaveBeenCalled();
  });
});

describe('moving to another bay', () => {
  it('creates the new bay row if needed, then does the move in ONE database call', async () => {
    const spaces2 = [...spaces, { id: 's23', kind: 'slot', floor_id: 'L', schematic_id: 'p', type: 'Car', assigned_id: '23', polygon: [] }];
    h.listParkingBaySpaces.mockResolvedValue(spaces2);
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_agreements = [activeAg];
    await parkingStore.load();
    h.api.upsert.mockResolvedValue({ id: 'b2', space_id: 's23', tenure: 'licensable', in_service: true });
    h.api.rpc.mockResolvedValue('a2');

    await parkingStore.moveToBay('a1', 's23', '2026-10-01');
    expect(h.api.rpc).toHaveBeenCalledWith('parking_move_to_bay', { p_agreement: 'a1', p_new_bay: 'b2', p_on: '2026-10-01' });
    // No step of the move is done piecemeal from the browser.
    expect(h.api.update).not.toHaveBeenCalled();
    expect(h.api.create).not.toHaveBeenCalled();
  });
});

describe('the timeline', () => {
  it("shows the agreement's entries and the bay's own, in time order, and never writes one", async () => {
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_agreements = [activeAg];
    await parkingStore.load();
    h.api.get.mockImplementation(async (t, opts) => {
      if (t !== 'parking_events') return tables[t] ?? [];
      return opts.filters.agreement_id
        ? [{ id: 'e1', agreement_id: 'a1', event_type: 'activated', created_at: '2026-01-01T09:00:00Z' }]
        : [{ id: 'e1', agreement_id: 'a1', event_type: 'activated', created_at: '2026-01-01T09:00:00Z' },
           { id: 'e0', agreement_id: null, event_type: 'bay_out_of_use', created_at: '2025-12-01T09:00:00Z' }];
    });
    const events = await parkingStore.loadEvents('a1');
    expect(events.map(e => e.id)).toEqual(['e0', 'e1']);
    const writes = [...h.api.create.mock.calls, ...h.api.update.mock.calls].map(c => c[0]);
    expect(writes).not.toContain('parking_events');
  });
});

// ── Phase 3 ────────────────────────────────────────────────────────────────

describe('the waiting list', () => {
  const waiting = { id: 'w1', holder_id: 'h1', wanted_size: 'Car', joined_on: '2026-01-01', status: 'waiting' };

  it('an offered bay cannot be allocated to anyone but the person offered it', async () => {
    tables.parking_holders = [holder, { id: 'h2', holder_type: 'leaseholder', display_name: 'Other', email: 'o@example.com' }];
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_applications = [{ ...waiting, status: 'offered', offered_bay_id: 'b1', offer_expires_on: '2026-10-10' }];
    await parkingStore.load();
    expect(get(parkingStore).bays[0].state).toBe('offered');
    await expect(parkingStore.createAgreement('s22', 'h2', { basis: 'licence', starts_on: '2026-10-01' }))
      .rejects.toThrow(/under offer/);
    expect(h.api.create).not.toHaveBeenCalled();
  });

  it('makes an offer on the bay row, and a declined offer goes back to the queue with its reason', async () => {
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_applications = [waiting];
    await parkingStore.load();
    await parkingStore.makeOffer('w1', 's22', { made_on: '2026-09-26', expires_on: '2026-10-10' });
    expect(h.api.update).toHaveBeenLastCalledWith('parking_applications', 'w1', expect.objectContaining({
      status: 'offered', offered_bay_id: 'b1', offer_expires_on: '2026-10-10' }), true);

    tables.parking_applications = [{ ...waiting, status: 'offered', offered_bay_id: 'b1', offer_expires_on: '2026-10-10' }];
    await parkingStore.load();
    await parkingStore.returnToQueue('w1', 'declined');
    const patch = h.api.update.mock.calls.at(-1)[2];
    expect(patch).toMatchObject({ status: 'waiting', last_offer_outcome: 'declined' });
    // It never sends a joined date: the place in the queue is not the app's to move.
    expect(patch).not.toHaveProperty('joined_on');
  });

  it('refuses an offer of the wrong size before writing anything', async () => {
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable' }];
    tables.parking_applications = [{ ...waiting, wanted_size: 'Bicycle' }];
    await parkingStore.load();
    await expect(parkingStore.makeOffer('w1', 's22', { made_on: '2026-09-26', expires_on: '2026-10-10' }))
      .rejects.toThrow(/they want Bicycle/);
    expect(h.api.update).not.toHaveBeenCalled();
  });
});

describe('the price list', () => {
  const price = { id: 't1', bay_size: 'Car', holder_class: 'all', amount: 60, period: 'month',
    vat_treatment: 'not_decided', deposit_amount: null, effective_from: '2026-01-01', effective_to: null };

  it('an agreement at the list price records which price it copied; a fee typed over records none', async () => {
    tables.parking_tariffs = [price];
    await parkingStore.load();
    h.api.upsert.mockResolvedValue({ id: 'b1', space_id: 's22', tenure: 'licensable', in_service: true });
    await parkingStore.createAgreement('s22', 'h1',
      { basis: 'licence', starts_on: '2026-10-01', max_vehicles: 1, fee_amount: '60.00', fee_period: 'month' });
    expect(h.api.create.mock.calls.find(c => c[0] === 'parking_agreements')[1].tariff_id).toBe('t1');
  });

  it('a fee typed by hand is not the list price', async () => {
    tables.parking_tariffs = [price];
    await parkingStore.load();
    h.api.upsert.mockResolvedValue({ id: 'b1', space_id: 's22', tenure: 'licensable', in_service: true });
    await parkingStore.createAgreement('s22', 'h1',
      { basis: 'licence', starts_on: '2026-10-01', max_vehicles: 1, fee_amount: '45', fee_period: 'month' });
    expect(h.api.create.mock.calls.find(c => c[0] === 'parking_agreements')[1].tariff_id).toBeNull();
  });

  it('changing the fee on an agreement clears the price it came from', async () => {
    tables.parking_tariffs = [price];
    tables.parking_bays = [{ id: 'b1', space_id: 's22', tenure: 'licensable', in_service: true }];
    tables.parking_agreements = [{ id: 'a1', reference: 'PA-0001', bay_id: 'b1', holder_id: 'h1', basis: 'licence',
      status: 'active', starts_on: '2026-01-01', ends_on: null, fee_amount: 60, fee_period: 'month',
      max_vehicles: 1, tariff_id: 't1' }];
    await parkingStore.load();
    await parkingStore.updateAgreement('a1', { fee_amount: '50' });
    expect(h.api.update.mock.calls.find(c => c[0] === 'parking_agreements')[2].tariff_id).toBeNull();
  });

  it('a new price is refused before writing when it overlaps, and a used price cannot be removed', async () => {
    tables.parking_tariffs = [price];
    tables.parking_agreements = [{ id: 'a1', reference: 'PA-0001', bay_id: 'b1', holder_id: 'h1', basis: 'licence',
      status: 'active', starts_on: '2026-01-01', tariff_id: 't1' }];
    await parkingStore.load();
    await expect(parkingStore.addTariff({ bay_size: 'Car', amount: '70', period: 'month', effective_from: '2025-12-01' }))
      .rejects.toThrow(/after that/);
    await expect(parkingStore.deleteTariff('t1')).rejects.toThrow(/cannot be removed/);
    expect(h.api.create).not.toHaveBeenCalled();
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it('removing a price added in error reopens the one it had closed', async () => {
    const closed = { ...price, effective_to: '2026-09-30' };
    const added = { ...price, id: 't2', amount: 70, effective_from: '2026-10-01' };
    tables.parking_tariffs = [closed, added];
    await parkingStore.load();
    await parkingStore.deleteTariff('t2');
    expect(h.api.delete).toHaveBeenCalledWith('parking_tariffs', 't2');
    expect(h.api.update).toHaveBeenCalledWith('parking_tariffs', 't1', { effective_to: null });
  });
});

describe('retention', () => {
  it('asks the database what is due without changing anything', async () => {
    h.api.rpc.mockResolvedValue({ agreements: 0 });
    await parkingStore.retentionDue();
    expect(h.api.rpc).toHaveBeenCalledWith('parking_apply_retention', { p_dry_run: true });
  });
  it('a run is logged with counts only, never the periods or anything personal', async () => {
    h.postJson.mockResolvedValue({ agreements: 1, holders: 1, periods: { agreement_years: 6 } });
    await parkingStore.runRetention();
    // Through the server route, which deletes licence files first.
    expect(h.postJson).toHaveBeenCalledWith('/api/parking/retention', {});
    expect(h.api.rpc).not.toHaveBeenCalledWith('parking_apply_retention', expect.objectContaining({ p_dry_run: false }));
    const audit = h.logAudit.mock.calls.find(c => c[1] === 'parking_retention');
    expect(audit[4].afterData).toEqual({ agreements: 1, holders: 1 });
  });
});

describe('deleting a draft made from an accepted offer', () => {
  // Migration 229 reopens the offer in the database; the screen must show it
  // reopened, not still "allocated" to an agreement that no longer exists.
  it('re-reads the waiting list, because the database reopened the offer', async () => {
    tables.parking_agreements = [{ id: 'd1', reference: 'PA-0002', bay_id: 'b1', holder_id: 'h1', basis: 'licence', status: 'draft', starts_on: '2026-10-01' }];
    tables.parking_applications = [{ id: 'app1', holder_id: 'h1', status: 'allocated', agreement_id: 'd1', joined_on: '2026-01-01' }];
    await parkingStore.load();
    tables.parking_applications = [{ id: 'app1', holder_id: 'h1', status: 'offered', agreement_id: null, joined_on: '2026-01-01' }];
    h.api.getAll.mockClear();
    await parkingStore.deleteDraft('d1');
    expect(h.api.delete).toHaveBeenCalledWith('parking_agreements', 'd1');
    expect(h.api.getAll.mock.calls.map(c => c[0])).toContain('parking_applications');
    expect(get(parkingStore).applications[0].status).toBe('offered');
  });

  // A draft's licence file names a person who is not staff, and deleting the
  // row used to leave it in Drive (2026-09-27).
  it("deletes the draft's documents first, and keeps the draft if one cannot go", async () => {
    tables.parking_agreements = [{ id: 'd1', reference: 'PA-0002', bay_id: 'b1', holder_id: 'h1', basis: 'licence', status: 'draft', starts_on: '2026-10-01' }];
    tables.parking_applications = [];
    await parkingStore.load();
    h.deleteDocumentsFor.mockRejectedValueOnce(new Error('1 of 1 attached document(s) could not be deleted'));
    await expect(parkingStore.deleteDraft('d1')).rejects.toThrow(/could not be deleted/);
    expect(h.api.delete).not.toHaveBeenCalledWith('parking_agreements', 'd1');

    const order = [];
    h.deleteDocumentsFor.mockImplementationOnce((t, id) => { order.push(`files ${t}:${id}`); return Promise.resolve(1); });
    h.api.delete.mockImplementationOnce((t, id) => { order.push(`row ${t}:${id}`); return Promise.resolve(); });
    await parkingStore.deleteDraft('d1');
    expect(order).toEqual(['files parking_agreement:d1', 'row parking_agreements:d1']);
  });
});

describe('audit of devices and deposits', () => {
  it('returning a device and refunding a deposit are both audited', async () => {
    tables.parking_agreements = [{ id: 'a1', reference: 'PA-0001', bay_id: 'b1', holder_id: 'h1', basis: 'licence',
      status: 'ended', starts_on: '2026-01-01', ends_on: '2026-06-30', deposit_amount: 20 }];
    tables.parking_access_devices = [{ id: 'd1', agreement_id: 'a1', device_type: 'fob', serial: '1', issued_on: '2026-01-01', returned_on: null }];
    await parkingStore.load();
    h.api.update.mockImplementation(async (t, id, patch) => ({ ...(t === 'parking_agreements' ? tables.parking_agreements[0] : tables.parking_access_devices[0]), ...patch }));
    await parkingStore.returnDevice('d1', '2026-07-01');
    await parkingStore.refundDeposit('a1', '2026-07-02');
    const actions = h.logAudit.mock.calls.map(c => c[4]?.eventAction);
    expect(actions).toEqual(expect.arrayContaining(['device_returned', 'deposit_refunded']));
  });
});
