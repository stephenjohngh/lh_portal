import { describe, it, expect } from 'vitest';
import { buildLookupSnapshot, usableSnapshot, lookupBoth } from './lookupSnapshot.js';
import { findByRegistration } from './agreementModel.js';

const data = {
  vehicles: [{ id: 'v1', agreement_id: 'a1', registration: 'AB12CDE', from_date: '2026-01-01', to_date: null, make: 'Ford' }],
  agreements: [{ id: 'a1', reference: 'PA-0001', status: 'active', holder_id: 'h1', bay_id: 'b1',
    starts_on: '2026-01-01', ends_on: null, fee: 60, deposit_amount: 25 }],
  holders: [{ id: 'h1', display_name: 'Alice Example', phone: '07700 900000', email: 'a@example.com',
    address: '1 Road', notes: 'private' }],
  bays: [{ bay_id: 'b1', ref: 'L/PK/22', space: { polygon: [] } }, { bay_id: null, ref: 'L/PK/99' }],
  permits: [{ id: 'p1', permit_number: 100, company: 'Acme', registration: 'AB12 CDE', valid_from: '2026-10-06',
    valid_from_time: '07:00', valid_to: '2026-10-12', valid_to_time: '19:00', issued_by: 'SP', created_by: 'u1' }],
};

describe('the phone copy for the offline Registration Lookup', () => {
  const snap = buildLookupSnapshot(data, 'u1', 1000);

  it('keeps only what the lookup reads — a holder is a name and a phone, nothing more', () => {
    expect(snap.holders).toEqual([{ id: 'h1', display_name: 'Alice Example', phone: '07700 900000' }]);
    expect(JSON.stringify(snap)).not.toMatch(/example\.com|1 Road|private|Ford|deposit|"fee"/);
    expect(snap.bays).toEqual([{ bay_id: 'b1', ref: 'L/PK/22' }]);
  });

  it('answers a lookup exactly as the live stores do', () => {
    const live = findByRegistration('ab12', data, '2026-10-10');
    const r = lookupBoth('ab12', snap, '2026-10-10', '09:00');
    expect(r.carPark.map((h) => [h.vehicle.registration, h.standing, h.bay?.ref, h.holder?.display_name, h.holder?.phone]))
      .toEqual(live.map((h) => [h.vehicle.registration, h.standing, h.bay?.ref, h.holder?.display_name, h.holder?.phone]));
    expect(r.permits.map((h) => [h.permit.permit_number, h.status])).toEqual([[100, 'current']]);
  });

  it('is shown only to the person it was read for', () => {
    expect(usableSnapshot(snap, 'u1')).toBe(snap);
    expect(usableSnapshot(snap, 'u2')).toBeNull();
    expect(usableSnapshot(snap, null)).toBeNull();
    expect(usableSnapshot({ ...snap, version: 0 }, 'u1')).toBeNull();
    expect(usableSnapshot(null, 'u1')).toBeNull();
  });
});
