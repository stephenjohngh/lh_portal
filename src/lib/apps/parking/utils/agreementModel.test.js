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
    const spaces = ['s1', 's3'].map(id => ({ id, kind: 'slot', floor_id: 'L', plan_id: 'p', polygon: [] }));
    const rows = [{ id: 'b1', space_id: 's1', tenure: 'licensable' }, { id: 'b3', space_id: 's3', tenure: 'demised', unit_ref: 'Flat 3' }];
    const bays = mergeBays(spaces, rows, [], [], ags, '2026-09-26');
    expect(bays.find(b => b.space_id === 's1').state).toBe('allocated');
    expect(bays.find(b => b.space_id === 's3').state).toBe('demised');
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
    expect(hits[0]).toMatchObject({ current: true, holder: { display_name: 'New' }, bay: { ref: 'L/PK/22' } });
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
