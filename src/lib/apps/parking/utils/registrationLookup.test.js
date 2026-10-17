import { describe, it, expect } from 'vitest';
import { lookupVerdict, scanCandidatesFrom } from './registrationLookup.js';

describe('lookupVerdict — the one-line answer by the car (2026-10-17)', () => {
  it('a licence covering today, or a current road permit, is allowed', () => {
    expect(lookupVerdict([{ standing: 'authorised' }], []).tone).toBe('ok');
    expect(lookupVerdict([{ standing: 'ended' }], [{ status: 'current' }]).tone).toBe('ok');
  });
  it('known but starting later is "not yet", known but finished is "no longer"', () => {
    expect(lookupVerdict([{ standing: 'pending' }], []).tone).toBe('pending');
    expect(lookupVerdict([], [{ status: 'upcoming' }, { status: 'expired' }]).tone).toBe('pending');
    expect(lookupVerdict([{ standing: 'ended' }], [{ status: 'expired' }]).tone).toBe('ended');
  });
  it('nothing anywhere is "Not found"', () => {
    expect(lookupVerdict([], [])).toMatchObject({ tone: 'none', title: 'Not found' });
  });
  it('⛔ never says "Not found" when the road permits could not be read', () => {
    const v = lookupVerdict([], [], 'no network');
    expect(v.title).not.toBe('Not found');
    expect(v.title).toMatch(/road permits NOT checked/);
    expect(lookupVerdict([{ standing: 'ended' }], [], 'x').title).toMatch(/NOT checked/);
  });
});

describe('scanCandidatesFrom', () => {
  it('one entry per registration, labelled with where it is known', () => {
    const c = scanCandidatesFrom([{ registration: 'AB12CDE' }], [{ registration: 'ab12 cde' }, { registration: 'X1' }]);
    expect(c).toEqual([{ value: 'AB12 CDE', label: 'car park · road permit' }, { value: 'X1', label: 'road permit' }]);
  });
});
