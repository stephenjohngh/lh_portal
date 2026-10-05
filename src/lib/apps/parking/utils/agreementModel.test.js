// src/lib/apps/parking/utils/agreementModel.test.js
import { describe, it, expect } from 'vitest';
import {
  HOLDER_FIELDS, validateHolder, holderRow, isExternal,
  basesForTenure, validateAgreement, agreementRow, canTransition, TRANSITIONS, LIVE,
  currentAgreement, covers, normaliseReg, validateVehicle, findByRegistration,
} from './agreementModel.js';
import { mergeBays } from './bayModel.js';

const resident = { holder_type: 'leaseholder', display_name: 'A Holder', email: 'a@example.com' };
const external = {
  holder_type: 'external_individual', display_name: 'B Outsider', email: 'b@example.com',
  privacy_notice_version: 'v1', privacy_notice_at: '2026-09-26',
};
const bay = { bay_id: 'b1', tenure: 'licensable', planning_restricted: false };

// ⛔ The bounded exception (design §3): a holder is a party to an agreement,
// never "the resident of Flat N". If any of these ever appears on a holder,
// the parking register has become the resident register the portal keeps out.
describe('a holder can never record where someone lives, or who they are beyond the agreement', () => {
  it('has no flat, unit, residency, birth or identity field', () => {
    const forbidden = /resid|flat|unit|lives|dob|birth|passport|licence_no|driving|nationali|health|disab|badge/i;
    expect(HOLDER_FIELDS.filter(f => forbidden.test(f))).toEqual([]);
  });
  it('holderRow writes nothing outside HOLDER_FIELDS, whatever it is handed', () => {
    const row = holderRow({ ...resident, flat: '12', resident_of: 'Flat 12', date_of_birth: '1970-01-01' });
    expect(Object.keys(row).sort()).toEqual([...HOLDER_FIELDS].sort());
  });
});

describe('validateHolder', () => {
  it('accepts a resident with an email, and an external holder given the privacy notice', () => {
    expect(validateHolder(resident)).toBeNull();
    expect(validateHolder(external)).toBeNull();
  });
  it('refuses an external holder not yet given the privacy notice', () => {
    expect(validateHolder({ ...external, privacy_notice_version: '' })).toMatch(/privacy notice/);
    expect(validateHolder({ ...external, privacy_notice_at: null })).toMatch(/privacy notice/);
  });
  it('needs somewhere to serve notice, and a company name for a company', () => {
    expect(validateHolder({ ...resident, email: '' })).toMatch(/serve notice/);
    expect(validateHolder({ ...resident, email: '', correspondence_address: 'Flat 12, Lonsdale House' })).toBeNull();
    expect(validateHolder({ ...external, holder_type: 'external_company' })).toMatch(/company/);
  });
  it('knows who is external', () => {
    expect(isExternal('external_company')).toBe(true);
    expect(isExternal('occupier')).toBe(false);
  });
});

describe('validateAgreement', () => {
  const a = { basis: 'licence', starts_on: '2026-10-01' };

  it('allows a licence on a licensable bay', () => {
    expect(validateAgreement(a, bay, resident, [])).toBeNull();
  });
  it('only records a demised bay, and only licenses a licensable one', () => {
    expect(validateAgreement(a, { ...bay, tenure: 'demised' }, resident)).toMatch(/recorded/);
    expect(validateAgreement({ ...a, basis: 'demise_record', unit_ref: 'Flat 12' }, bay, resident)).toMatch(/licensable/);
    expect(validateAgreement({ ...a, basis: 'demise_record', unit_ref: '' }, { ...bay, tenure: 'demised' }, resident)).toMatch(/flat/);
    expect(basesForTenure('not_for_allocation')).toEqual([]);
  });
  it('refuses an external holder on a residents-only bay', () => {
    expect(validateAgreement(a, { ...bay, planning_restricted: true }, external)).toMatch(/residents only/);
    expect(validateAgreement(a, { ...bay, planning_restricted: true }, resident)).toBeNull();
  });
  it('refuses an end before the start', () => {
    expect(validateAgreement({ ...a, ends_on: '2026-09-01' }, bay, resident)).toMatch(/before/);
  });

  // ⛔ The database refuses this too (the exclusion constraint); this is so the
  // person sees WHICH agreement already holds the bay.
  it('refuses an overlap with a live agreement on the same bay, and names it', () => {
    const others = [{ id: 'x', reference: 'PA-0003', bay_id: 'b1', status: 'active', starts_on: '2026-01-01', ends_on: null }];
    expect(validateAgreement(a, bay, resident, others)).toMatch(/PA-0003/);
    // An ended agreement, another bay, or itself, are not clashes.
    expect(validateAgreement(a, bay, resident, [{ ...others[0], status: 'ended', ends_on: '2026-06-30' }])).toBeNull();
    expect(validateAgreement(a, bay, resident, [{ ...others[0], bay_id: 'b2' }])).toBeNull();
    expect(validateAgreement({ ...a, id: 'x' }, bay, resident, others)).toBeNull();
    // Back to back is not an overlap; sharing a day is.
    const earlier = [{ ...others[0], ends_on: '2026-09-30' }];
    expect(validateAgreement(a, bay, resident, earlier)).toBeNull();
    expect(validateAgreement(a, bay, resident, [{ ...others[0], ends_on: '2026-10-01' }])).toMatch(/PA-0003/);
  });
  it('a draft holds the bay too', () => {
    expect(LIVE.has('draft')).toBe(true);
  });
});

describe('agreementRow', () => {
  it('turns blanks into nulls and numbers into numbers, and drops a unit on a licence', () => {
    const row = agreementRow({ basis: 'licence', unit_ref: 'Flat 1', starts_on: '2026-10-01',
      ends_on: '', fee_amount: '60', fee_period: 'month', max_vehicles: '2', notice_days: '' });
    expect(row).toMatchObject({ unit_ref: null, ends_on: null, fee_amount: 60, max_vehicles: 2, notice_days: null });
  });
});

describe('the lifecycle', () => {
  it('matches the trigger: one way, and ended or terminated is final', () => {
    expect(canTransition('draft', 'active')).toBe(true);
    expect(canTransition('active', 'draft')).toBe(false);
    expect(canTransition('notice_given', 'active')).toBe(true);   // notice withdrawn
    expect(TRANSITIONS.ended).toEqual([]);
    expect(TRANSITIONS.terminated).toEqual([]);
  });
});

describe('currentAgreement and the allocated state', () => {
  const ags = [
    { id: 'a1', bay_id: 'b1', basis: 'licence', status: 'active', starts_on: '2026-01-01', ends_on: null },
    { id: 'a2', bay_id: 'b2', basis: 'licence', status: 'draft',  starts_on: '2026-01-01', ends_on: null },
    { id: 'a3', bay_id: 'b3', basis: 'demise_record', status: 'active', starts_on: '2026-01-01', ends_on: null, unit_ref: 'Flat 3' },
  ];
  it('is the active agreement covering today; a draft does not count', () => {
    expect(currentAgreement('b1', ags, '2026-09-26')?.id).toBe('a1');
    expect(currentAgreement('b2', ags, '2026-09-26')).toBeNull();
    expect(covers(ags[0], '2025-12-31')).toBe(false);
  });
  it('makes a licensed bay "allocated", and leaves a recorded demised bay "belongs to a flat"', () => {
    const spaces = ['s1', 's3'].map(id => ({ id, kind: 'slot', floor_id: 'L', schematic_id: 'p', polygon: [] }));
    const rows = [{ id: 'b1', space_id: 's1', tenure: 'licensable' }, { id: 'b3', space_id: 's3', tenure: 'demised', unit_ref: 'Flat 3' }];
    const bays = mergeBays(spaces, rows, [], [], ags, '2026-09-26');
    expect(bays.find(b => b.space_id === 's1')?.state).toBe('allocated');
    expect(bays.find(b => b.space_id === 's3')?.state).toBe('demised');
  });
});

describe('vehicles and the registration search', () => {
  it('normalises a registration however it is typed', () => {
    expect(normaliseReg(' ab12 cde ')).toBe('AB12CDE');
    expect(normaliseReg('AB-12-CDE')).toBe('AB12CDE');
  });
  it('refuses a duplicate and more vehicles than the agreement allows', () => {
    const ag = { id: 'a1', max_vehicles: 1 };
    const current = [{ agreement_id: 'a1', registration: 'AB12CDE', to_date: null }];
    expect(validateVehicle({ registration: 'ab12 cde' }, { ...ag, max_vehicles: 2 }, current)).toMatch(/already/);
    expect(validateVehicle({ registration: 'XY99ZZZ' }, ag, current)).toMatch(/allows 1 vehicle/);
    expect(validateVehicle({ registration: 'XY99ZZZ' }, ag, [{ ...current[0], to_date: '2026-09-01' }])).toBeNull();
  });
  it('finds a car by part of its registration, current ones first', () => {
    const data = {
      vehicles: [
        { id: 'v1', agreement_id: 'a1', registration: 'AB12CDE', to_date: '2026-01-01' },
        { id: 'v2', agreement_id: 'a2', registration: 'AB12CDF', to_date: null },
      ],
      agreements: [{ id: 'a1', bay_id: 'b1', holder_id: 'h1', status: 'ended' },
                   { id: 'a2', bay_id: 'b1', holder_id: 'h2', status: 'active' }],
      holders: [{ id: 'h1', display_name: 'Old' }, { id: 'h2', display_name: 'New' }],
      bays: [{ bay_id: 'b1', ref: 'L/PK/22' }],
    };
    const hits = findByRegistration('ab12 cd', data);
    expect(hits.map(h => h.vehicle.id)).toEqual(['v2', 'v1']);
    expect(hits[0]).toMatchObject({ standing: 'authorised', holder: { display_name: 'New' }, bay: { ref: 'L/PK/22' } });
    expect(hits[1].standing).toBe('ended');
    expect(findByRegistration('a', data)).toEqual([]);   // too short to mean anything
  });
});

// The trigger checks tenure and residents-only when an agreement is MADE. If
// it checked on every edit, changing a bay's tenure later would make its old
// licence impossible even to amend or end.
describe('editing an existing agreement after the bay changed', () => {
  it('does not re-apply the allocation rules to terms edits', () => {
    const lic = { id: 'a1', basis: 'licence', starts_on: '2026-01-01' };
    const nowDemised = { bay_id: 'b1', tenure: 'demised', planning_restricted: true };
    const outsider = { holder_type: 'external_individual' };
    expect(validateAgreement(lic, nowDemised, outsider, [])).toMatch(/recorded/);
    expect(validateAgreement(lic, nowDemised, outsider, [], { allocating: false })).toBeNull();
  });
  it('still refuses bad dates and overlaps on an edit', () => {
    const lic = { id: 'a1', basis: 'licence', starts_on: '2026-02-01', ends_on: '2026-01-01' };
    expect(validateAgreement(lic, { bay_id: 'b1', tenure: 'licensable' }, {}, [], { allocating: false })).toMatch(/before/);
  });
});

// ── The review fixes of 2026-09-27 (migration 229) ─────────────────────────
import { vehicleStanding, reservingAgreement, validateAgreement as va, validateMove as vm,
  depositRefundProblem as drp } from './agreementModel.js';

describe('where a vehicle stands today', () => {
  // "Authorised" used to mean any live agreement, draft included — so a car on
  // an unsigned draft, or on a licence starting next month, read as allowed.
  const T = '2026-09-27';
  it('is authorised only on an active agreement covering today', () => {
    expect(vehicleStanding({}, { status: 'active', starts_on: '2026-01-01' }, T)).toBe('authorised');
    expect(vehicleStanding({}, { status: 'notice_given', starts_on: '2026-01-01', ends_on: '2026-10-31' }, T)).toBe('authorised');
  });
  it('is pending on a draft, or when the agreement or the vehicle starts later', () => {
    expect(vehicleStanding({}, { status: 'draft', starts_on: '2026-01-01' }, T)).toBe('pending');
    expect(vehicleStanding({}, { status: 'active', starts_on: '2026-10-01' }, T)).toBe('pending');
    expect(vehicleStanding({ from_date: '2026-10-01' }, { status: 'active', starts_on: '2026-01-01' }, T)).toBe('pending');
  });
  it('has ended when the vehicle, or the agreement, has', () => {
    expect(vehicleStanding({ to_date: '2026-09-01' }, { status: 'active', starts_on: '2026-01-01' }, T)).toBe('ended');
    expect(vehicleStanding({}, { status: 'active', starts_on: '2026-01-01', ends_on: '2026-09-26' }, T)).toBe('ended');
    expect(vehicleStanding({}, { status: 'ended', starts_on: '2026-01-01' }, T)).toBe('ended');
    expect(vehicleStanding({}, null, T)).toBe('ended');
  });
});

describe('a bay held without being in use today', () => {
  const T = '2026-09-27';
  it('is reserved by a draft or a licence that starts later, never by a record of a demised bay', () => {
    const ags = [
      { id: 'x', bay_id: 'b1', basis: 'licence', status: 'active', starts_on: '2026-11-01' },
      { id: 'y', bay_id: 'b1', basis: 'licence', status: 'draft', starts_on: '2026-10-01' },
      { id: 'z', bay_id: 'b2', basis: 'demise_record', status: 'draft', starts_on: '2026-10-01' },
      { id: 'w', bay_id: 'b3', basis: 'licence', status: 'active', starts_on: '2026-01-01' },
    ];
    expect(reservingAgreement('b1', ags, T)?.id).toBe('y');     // the earliest
    expect(reservingAgreement('b2', ags, T)).toBeNull();
    expect(reservingAgreement('b3', ags, T)).toBeNull();        // that one is current, not reserved
  });
});

describe('an out-of-use bay', () => {
  const holder = { holder_type: 'leaseholder' };
  it("cannot be allocated, but a demised bay's holder can still be recorded", () => {
    const bay = { ref: 'L/PK/1', bay_id: 'b1', tenure: 'licensable', in_service: false };
    expect(va({ basis: 'licence', starts_on: '2026-10-01' }, bay, holder)).toMatch(/out of use/);
    const demised = { ref: 'L/PK/2', bay_id: 'b2', tenure: 'demised', in_service: false };
    expect(va({ basis: 'demise_record', starts_on: '2026-10-01', unit_ref: 'Flat 3' }, demised, holder)).toBeNull();
  });
});

describe('moving to a bay under offer', () => {
  it('is refused unless the offer is to the same holder', () => {
    const ag = { id: 'a1', bay_id: 'b1', holder_id: 'h1', basis: 'licence', status: 'active', starts_on: '2026-01-01' };
    const to = { ref: 'L/PK/9', bay_id: 'b9', tenure: 'licensable', in_service: true };
    const offerToOther = [{ status: 'offered', offered_bay_id: 'b9', holder_id: 'h2' }];
    const offerToSame = [{ status: 'offered', offered_bay_id: 'b9', holder_id: 'h1' }];
    const holder = { holder_type: 'leaseholder' };
    expect(vm(ag, to, '2026-06-01', holder, [ag], offerToOther)).toMatch(/under offer/);
    expect(vm(ag, to, '2026-06-01', holder, [ag], offerToSame)).toBeNull();
  });
});

describe('a deposit that moved with the holder', () => {
  it('cannot be refunded from the old agreement', () => {
    const old = { id: 'a1', deposit_amount: 50, deposit_transferred_to: 'a2' };
    expect(drp(old, [], [old, { id: 'a2', reference: 'PA-0009' }])).toMatch(/moved to PA-0009/);
  });
});
