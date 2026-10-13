import { describe, it, expect } from 'vitest';
import { fixUkPlate } from './ukPlate.js';

const fix = (s) => fixUkPlate(s)?.value ?? null;

describe('fixUkPlate — lookalikes put right by position', () => {
  it('current format (LL DD LLL): an I or O in a digit slot is a 1 or 0, and back again', () => {
    expect(fix('OE2I XXD')).toBe('OE21XXD');
    expect(fix('0E21 XXD')).toBe('OE21XXD');
    expect(fix('0E2I XXD')).toBe('OE21XXD');
    expect(fix('BD51 SMR')).toBe('BD51SMR');           // already right: unchanged
    expect(fixUkPlate('BD51SMR')).toMatchObject({ format: 'current', changes: 0 });
    expect(fix('BD5I 5MR')).toBe('BD51SMR');
  });

  it('prefix (L D{1,3} LLL) and suffix (LLL D{1,3} L)', () => {
    expect(fix('A12E ABC')).toBe(null);                 // E is no lookalike of a digit: not forced
    expect(fix('AI2 ABC')).toBe('A12ABC');             // (AI23 ABC would be a valid CURRENT plate, so it stays)
    expect(fix('AI23 ABC')).toBe('AI23ABC');
    expect(fix('ABC I23A')).toBe('ABC123A');
    expect(fix('A8C 123A')).toBe('ABC123A');
    expect(fixUkPlate('A123ABC')?.format).toBe('prefix');
    expect(fixUkPlate('ABC123A')?.format).toBe('suffix');
  });

  it('Northern Ireland (L{1,3} D{1,4}) — and a real NI plate is not bent into another format', () => {
    expect(fix('AIL I234')).toBe('AIL1234');
    expect(fixUkPlate('AIL1234')).toMatchObject({ format: 'northern-ireland', changes: 0 });
  });

  it('a reading that fits no format is left alone', () => {
    expect(fix('XXXXXXXX')).toBe(null);
    expect(fix('')).toBe(null);
    expect(fix('KL55MNPQ')).toBe(null);
  });
});
