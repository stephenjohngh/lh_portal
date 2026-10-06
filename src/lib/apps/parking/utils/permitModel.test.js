import { describe, it, expect } from 'vitest';
import {
  validToFor, displayReg, validatePermit, permitRow, permitNumberLabel, permitStatus, permitDays, permitFilename,
  reissueFields, recentValues, hhmm, fmtPermitWhen,
} from './permitModel.js';

const ok = { company: 'Acme Scaffolding', registration: 'ab12 cde', valid_from: '2026-10-06', valid_to: '2026-10-06',
  valid_from_time: '07:00', valid_to_time: '19:00', issued_by: 'J Smith' };

describe('permitModel', () => {
  it('a day permit ends the day it starts; a week permit covers seven days', () => {
    expect(validToFor('2026-10-06', 'day')).toBe('2026-10-06');
    expect(validToFor('2026-10-06', 'week')).toBe('2026-10-12');
    expect(permitDays({ valid_from: '2026-10-06', valid_to: validToFor('2026-10-06', 'week') })).toBe(7);
    expect(permitDays({ valid_from: '2026-10-06', valid_to: '2026-10-06' })).toBe(1);
  });

  it('a week across the clocks going back is still seven calendar days', () => {
    expect(validToFor('2026-10-22', 'week')).toBe('2026-10-28');   // BST ends 25 Oct 2026
  });

  it('prints a registration in capitals, keeping one space', () => {
    expect(displayReg(' ab12   cde ')).toBe('AB12 CDE');
    expect(displayReg('ab-12.cde')).toBe('AB12CDE');
  });

  it('says what is missing, one thing at a time', () => {
    expect(validatePermit(ok)).toBeNull();
    expect(validatePermit({ ...ok, company: '  ' })).toMatch(/company/);
    expect(validatePermit({ ...ok, registration: '--' })).toMatch(/registration/);
    expect(validatePermit({ ...ok, valid_to: '2026-10-05' })).toMatch(/cannot end before/);
    expect(validatePermit({ ...ok, issued_by: '' })).toMatch(/issued/);
  });

  it('never sends a permit number — the database gives it', () => {
    const row = permitRow({ ...ok, permit_number: 7 });
    expect(row).not.toHaveProperty('permit_number');
    expect(row.registration).toBe('AB12 CDE');
  });

  it('labels numbers with at least three digits', () => {
    expect(permitNumberLabel(3)).toBe('003');
    expect(permitNumberLabel(100)).toBe('100');
    expect(permitNumberLabel(1234)).toBe('1234');
  });

  it('is in force from the first day to the last, inclusive', () => {
    const p = { valid_from: '2026-10-06', valid_to: '2026-10-12' };
    expect(permitStatus(p, '2026-10-05')).toBe('upcoming');
    expect(permitStatus(p, '2026-10-06')).toBe('current');
    expect(permitStatus(p, '2026-10-12')).toBe('current');
    expect(permitStatus(p, '2026-10-13')).toBe('expired');
  });

  it('names the file by number and registration, and a sample as a sample', () => {
    expect(permitFilename({ permit_number: 100, registration: 'AB12 CDE' })).toBe('Parking_Permit_100_AB12CDE.pdf');
    expect(permitFilename({ sample: true, permit_number: 100, registration: 'AB12 CDE' })).toBe('Parking_Permit_SAMPLE.pdf');
  });

  it('reads a time as HH:MM, as Postgres or a time box gives it', () => {
    expect(hhmm('07:00:00')).toBe('07:00');
    expect(hhmm('7:05')).toBe('07:05');
    expect(hhmm('')).toBe('');
    expect(hhmm(null)).toBe('');
  });

  it('needs both times, and a one-day permit must end after it starts', () => {
    expect(validatePermit({ ...ok, valid_from_time: '' })).toMatch(/time the permit starts/);
    expect(validatePermit({ ...ok, valid_to_time: '' })).toMatch(/time the permit ends/);
    expect(validatePermit({ ...ok, valid_to_time: '07:00' })).toMatch(/end time must be after/);
    expect(validatePermit({ ...ok, valid_to: '2026-10-07', valid_to_time: '06:00' })).toBeNull();   // next morning is fine
  });

  it('saves the times as HH:MM', () => {
    expect(permitRow({ ...ok, valid_from_time: '07:00:00' })).toMatchObject({ valid_from_time: '07:00', valid_to_time: '19:00' });
  });

  it('is in force from the start time to the end time, the end minute included', () => {
    const p = { valid_from: '2026-10-06', valid_from_time: '07:00:00', valid_to: '2026-10-06', valid_to_time: '19:00:00' };
    expect(permitStatus(p, '2026-10-06', '06:59')).toBe('upcoming');
    expect(permitStatus(p, '2026-10-06', '07:00')).toBe('current');
    expect(permitStatus(p, '2026-10-06', '19:00')).toBe('current');
    expect(permitStatus(p, '2026-10-06', '19:01')).toBe('expired');
  });

  it('prints a start or end as date and time', () => {
    expect(fmtPermitWhen('2026-10-06', '07:00:00')).toBe('06 Oct 2026, 07:00');
    expect(fmtPermitWhen('2026-10-06', null)).toBe('06 Oct 2026');
  });

  it('a new permit like an old one keeps the company and vehicle, takes fresh dates, and not the old issuer', () => {
    const f = reissueFields({ ...ok, permit_number: 100, valid_from: '2026-01-01', valid_to: '2026-01-07' }, '2026-10-06');
    expect(f).toEqual({ company: 'Acme Scaffolding', registration: 'ab12 cde', valid_from: '2026-10-06', valid_to: '2026-10-06' });
    expect(f).not.toHaveProperty('issued_by');
    expect(f).not.toHaveProperty('permit_number');
  });

  it('suggests each company and registration once, newest first', () => {
    const permits = [
      { company: 'Acme', registration: 'AB12 CDE' },
      { company: 'Bolt Ltd', registration: 'XY99 ZZZ' },
      { company: 'acme ', registration: 'ab12cde' },
      { company: '', registration: '' },
    ];
    expect(recentValues(permits, 'company')).toEqual(['Acme', 'Bolt Ltd']);
    expect(recentValues(permits, 'registration')).toEqual(['AB12 CDE', 'XY99 ZZZ']);
  });
});

