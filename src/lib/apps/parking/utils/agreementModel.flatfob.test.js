// The access-device and registration changes of 2026-10-10 (user):
// "New fob" / "Existing flat fob", and registrations shown with their space.
import { describe, it, expect } from 'vitest';
import {
  DEVICE_ISSUE_OPTIONS, isReturnable, validateDevice, outstandingDevices, depositRefundProblem,
  unreturnedAfterEnd, formatReg, normaliseReg, validateVehicle, findByRegistration,
} from './agreementModel.js';

const ag = { id: 'a1', reference: 'PA-0001', status: 'active', deposit_amount: 25 };

describe('access devices: a new fob, or the flat’s own fob', () => {
  it('offers exactly the two', () => {
    expect(DEVICE_ISSUE_OPTIONS.map((o) => o.label)).toEqual(['New fob', 'Existing flat fob']);
  });

  it('a new fob needs its serial; a flat fob may have none', () => {
    expect(validateDevice({ device_type: 'fob', serial: '' })).toMatch(/serial/);
    expect(validateDevice({ device_type: 'flat_fob', serial: '' })).toBeNull();
  });

  it('a flat fob is never "still out": it does not hold the deposit or flag an ended agreement', () => {
    const devices = [{ id: 'd1', agreement_id: 'a1', device_type: 'flat_fob', returned_on: null }];
    expect(isReturnable(devices[0])).toBe(false);
    expect(outstandingDevices('a1', devices)).toEqual([]);
    expect(depositRefundProblem(ag, devices)).toBeNull();
    expect(unreturnedAfterEnd([{ ...ag, status: 'ended' }], devices)).toEqual([]);
  });

  it('a new fob still out still holds the deposit', () => {
    const devices = [{ id: 'd1', agreement_id: 'a1', device_type: 'fob', serial: 'F-1', returned_on: null }];
    expect(depositRefundProblem(ag, devices)).toMatch(/not been returned/);
  });

  it('two holders can both record a flat fob with no serial', () => {
    const devices = [{ id: 'd1', agreement_id: 'a2', device_type: 'flat_fob', serial: null, returned_on: null }];
    expect(validateDevice({ device_type: 'flat_fob', serial: '' }, devices)).toBeNull();
  });
});

describe('registrations keep their space on screen', () => {
  it('shows a stored registration in the standard UK layout', () => {
    expect(formatReg('XY67MNB')).toBe('XY67 MNB');    // current
    expect(formatReg('A123BCD')).toBe('A123 BCD');    // prefix
    expect(formatReg('ABC123D')).toBe('ABC 123D');    // suffix
    expect(formatReg('ABC123')).toBe('ABC 123');      // dateless
    expect(formatReg('123ABC')).toBe('123 ABC');
    expect(formatReg('ab12 cde')).toBe('AB12 CDE');   // already spaced: kept, tidied
    expect(formatReg('ZZZZZZZZ')).toBe('ZZZZZZZZ');   // anything else as stored
  });

  it('matching ignores spaces either way', () => {
    const vehicles = [{ id: 'v1', agreement_id: 'a1', registration: 'XY67MNB' }];
    expect(findByRegistration('xy67 mnb', { vehicles, agreements: [ag] })).toHaveLength(1);
    expect(validateVehicle({ registration: 'XY67 MNB' }, { ...ag, max_vehicles: 2 }, vehicles)).toMatch(/XY67 MNB is already/);
    expect(normaliseReg('XY67 MNB')).toBe('XY67MNB');  // what is stored
  });
});
