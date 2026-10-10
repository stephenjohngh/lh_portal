import { describe, it, expect } from 'vitest';
import {
  SCAN_PROFILES, normaliseScan, readingsFrom, scanDistance, allowedDistance, matchScan,
} from './scanMatch.js';

const PLATES = [
  { value: 'AB12 CDE', label: 'car park' },
  { value: 'ABC 123', label: 'road permit' },
  { value: 'XY70 ZZZ', label: 'car park' },
  { value: 'B10 OBB', label: 'car park' },
];

describe('reading what the reader returned', () => {
  it('keeps only the profile’s characters, upper case, no spaces', () => {
    expect(normaliseScan(' ab12 cde\n', 'registration')).toBe('AB12CDE');
    expect(normaliseScan('Flat G.04', 'number')).toBe('FLATG.04');
  });

  it('offers each line whole and each word on its own, within the profile’s lengths', () => {
    const r = readingsFrom('GB AB12 CDE', 'registration');
    expect(r).toContain('AB12');
    expect(r).toContain('CDE');
    expect(r).toContain('AB12CDE');                // the "GB" band dropped
    expect(r).not.toContain('GBAB12CDE');          // 9 characters — longer than any plate
    expect(r[0]).toBe('AB12CDE');                  // the longest plausible reading is offered first
    expect(readingsFrom('GBAB12 CDE', 'registration')[0]).toBe('AB12CDE');   // band read into the plate
    expect(readingsFrom('GBAB12 CDE', 'number')).not.toContain('AB12CDE');  // only plates have a band
  });
});

describe('matching a reading to the values the screen knows', () => {
  it('an exact reading comes first and says so', () => {
    const m = matchScan('AB12 CDE', PLATES, 'registration');
    expect(m[0]).toMatchObject({ value: 'AB12 CDE', label: 'car park', exact: true, distance: 0 });
  });

  it('forgives the letters a reader confuses — O for 0, I for 1, 8 for B', () => {
    const m = matchScan('A812 CDE', PLATES, 'registration');
    expect(m[0].value).toBe('AB12 CDE');
    expect(m[0].exact).toBe(false);
    expect(matchScan('ABC I23', PLATES, 'registration')[0].value).toBe('ABC 123');
    expect(matchScan('BI0 O8B', PLATES, 'registration')[0].value).toBe('B10 OBB');
  });

  it('still matches with the edge of the plate read beside it', () => {
    expect(matchScan('GB AB12CDE', PLATES, 'registration')[0].value).toBe('AB12 CDE');
    expect(matchScan('GB AB12 CDE', PLATES, 'registration')[0].value).toBe('AB12 CDE');
    expect(matchScan('|AB12 CDE.', PLATES, 'registration')[0].value).toBe('AB12 CDE');
  });

  it('does not offer a plate that differs by more than a slip', () => {
    expect(matchScan('KL55 MNP', PLATES, 'registration')).toEqual([]);
  });

  it('offers nothing when nothing was read', () => {
    expect(matchScan('', PLATES, 'registration')).toEqual([]);
    expect(matchScan('  ~~ ', PLATES, 'registration')).toEqual([]);
  });

  it('a short number never matches a DIFFERENT short number — only a confused letter', () => {
    const doors = [{ value: '12' }, { value: '13' }, { value: '10' }, { value: 'G.04' }];
    expect(matchScan('12', doors, 'number').map((m) => m.value)).toEqual(['12']);
    expect(matchScan('1O', doors, 'number').map((m) => m.value)).toEqual(['10']);
    expect(matchScan('G.O4', doors, 'number')[0].value).toBe('G.04');
    // a value inside a longer reading is not the reading
    expect(matchScan('12', [{ value: '2' }, { value: '12' }], 'number').map((m) => m.value)).toEqual(['12']);
  });

  it('two different things with the same value are both offered, when they carry ids', () => {
    const m = matchScan('12', [{ value: '12', id: 'a' }, { value: '12', id: 'b' }], 'number');
    expect(m.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('lists a value once, however many times it is known', () => {
    const m = matchScan('AB12CDE', [{ value: 'AB12 CDE' }, { value: 'ab12cde' }], 'registration');
    expect(m).toHaveLength(1);
  });
});

describe('the distance', () => {
  it('is 0 for the same text and a fraction for a confused letter', () => {
    expect(scanDistance('AB12CDE', 'AB12CDE')).toBe(0);
    expect(scanDistance('AB12CD3', 'AB12CDE')).toBe(1);
    expect(scanDistance('AB12C0E', 'AB12CDE')).toBeCloseTo(0.3);
  });

  it('allows more for a longer value', () => {
    expect(allowedDistance(2)).toBeLessThan(1);
    expect(allowedDistance(7)).toBeGreaterThan(allowedDistance(4));
  });
});

describe('readings and codes', () => {
  it('a reading keeps only digits, the point and a sign', () => {
    expect(readingsFrom('2.5 bar', 'reading')).toContain('2.5');
    expect(readingsFrom('-4.0', 'reading')).toContain('-4.0');
    expect(normaliseScan('BAR', 'reading')).toBe('');
  });
  it('a code keeps the separators labels use, and runs longer than a plate', () => {
    expect(readingsFrom('SN 12345-ABC/678', 'code')).toContain('SN12345-ABC/678');
  });
});

describe('profiles', () => {
  it('every profile can be read and has a guide box shape', () => {
    for (const p of Object.values(SCAN_PROFILES)) {
      expect(p.charset.length).toBeGreaterThan(0);
      expect(p.minLength).toBeLessThanOrEqual(p.maxLength);
      expect(p.aspect).toBeGreaterThan(0);
    }
  });
});
