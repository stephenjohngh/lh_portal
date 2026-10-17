import { describe, it, expect } from 'vitest';
import { lookupVerdict, scanCandidatesFrom } from './registrationLookup.js';

describe('lookupVerdict — the answer by the car, for where it is (2026-10-17)', () => {
  const licence = { standing: 'authorised', bay: { ref: 'L/PK/22' } };
  const permit = { status: 'current', permit: { permit_number: 101, company: 'Acme' } };

  it('in the car park only a car park licence counts — a road permit does not, but is mentioned', () => {
    expect(lookupVerdict([licence], [], '', 'car_park').tone).toBe('ok');
    const v = lookupVerdict([], [permit], '', 'car_park');
    expect(v.tone).toBe('none');
    expect(v.elsewhere).toMatch(/current road permit \(permit 101, Acme\) — for the side road, not the car park/);
  });
  it('on the side road only a road permit counts — a car park licence does not, but is mentioned (the user’s case)', () => {
    expect(lookupVerdict([], [permit], '', 'road').tone).toBe('ok');
    const v = lookupVerdict([licence], [], '', 'road');
    expect(v.tone).toBe('none');
    expect(v.title).toBe('Not found');
    expect(v.elsewhere).toMatch(/car park licence today \(bay L\/PK\/22\) — not a road permit/);
  });
  it('known here but not yet, or no longer', () => {
    expect(lookupVerdict([{ standing: 'pending' }], [], '', 'car_park').tone).toBe('pending');
    expect(lookupVerdict([{ standing: 'ended' }], [], '', 'car_park').tone).toBe('ended');
    expect(lookupVerdict([], [{ status: 'upcoming' }], '', 'road').tone).toBe('pending');
    expect(lookupVerdict([], [{ status: 'expired' }], '', 'road').tone).toBe('ended');
    expect(lookupVerdict([], [{ status: 'expired' }], '', 'car_park').tone).toBe('none');
  });
  it('⛔ on the side road, never "Not found" when the road permits could not be read; in the car park they do not matter', () => {
    const v = lookupVerdict([], [], 'no network', 'road');
    expect(v.title).not.toBe('Not found');
    expect(v.title).toMatch(/NOT checked/);
    expect(lookupVerdict([], [], 'no network', 'car_park').title).toBe('Not found');
  });
});

describe('scanCandidatesFrom', () => {
  it('one entry per registration, labelled with where it is known', () => {
    const c = scanCandidatesFrom([{ registration: 'AB12CDE' }], [{ registration: 'ab12 cde' }, { registration: 'X1' }]);
    expect(c).toEqual([{ value: 'AB12 CDE', label: 'car park · road permit' }, { value: 'X1', label: 'road permit' }]);
  });
});

import { splitExact } from './registrationLookup.js';
describe('splitExact — Car check answers for the whole registration only', () => {
  it('"XC" does not count as XCVB 675; it is offered as another car', () => {
    const permitHits = [{ permit: { registration: 'XCVB 675' }, status: 'current' }];
    const s = splitExact('xc', [], permitHits);
    expect(s.permitHits).toEqual([]);
    expect(s.otherPermitHits).toEqual(permitHits);
    expect(lookupVerdict(s.hits, s.permitHits, '', 'road').tone).toBe('none');
  });
  it('the whole registration, any spacing or case, counts', () => {
    const permitHits = [{ permit: { registration: 'XCVB 675' }, status: 'current' }];
    const hits = [{ vehicle: { registration: 'XCVB675' }, standing: 'ended' }];
    const s = splitExact('xcvb675', hits, permitHits);
    expect(s.permitHits).toHaveLength(1);
    expect(s.hits).toHaveLength(1);
    expect(lookupVerdict(s.hits, s.permitHits, '', 'road').tone).toBe('ok');
  });
});
