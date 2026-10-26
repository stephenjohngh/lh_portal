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
    expect(fix('A12X ABC')).toBe(null);                 // X is no lookalike of a digit: not forced
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

describe('a letter that is no digit but stands where one must be', () => {
  it('reads E as the 6 that makes a real age identifier', () => {
    expect(fixUkPlate('EYES BNJ')?.value).toBe('EY65BNJ');
  });
  it('leaves a digit already read, and a plate that fits no format, alone', () => {
    expect(fixUkPlate('EY65BNJ')?.value).toBe('EY65BNJ');
    expect(fixUkPlate('DA67PJO')?.value).toBe('DA67PJO');
  });
});

describe('impossible readings put right (2026-10-26, plates VK65 SVG and DA67 PJO)', () => {
  it('an age identifier that cannot be real takes the nearest lookalike that can: VK85 SVG is VK65 SVG', () => {
    expect(fixUkPlate('VK85SVG').value).toBe('VK65SVG');
    expect(fixUkPlate('VKB5SVG').value).toBe('VK65SVG');    // B read for the 6, then the 8 it stands for
    expect(fixUkPlate('DA87PJO').value).toBe('DA67PJO');
  });

  it('leaves every real age identifier alone, 8 included (08, 18, 58 are real years)', () => {
    for (const plate of ['AB08CDE', 'AB18CDE', 'AB58CDE', 'BD51SMR', 'AB26CDE', 'AB76CDE', 'AB02CDE']) {
      expect(fixUkPlate(plate).value).toBe(plate);
    }
  });

  it('a Q in a current-format letter slot is an O: DA67 PJQ is DA67 PJO', () => {
    expect(fixUkPlate('DA67PJQ').value).toBe('DA67PJO');
    expect(fixUkPlate('DQ67PJO').value).toBe('DO67PJO');
  });

  it('does not touch the older formats, where Q may belong to the plate', () => {
    expect(fixUkPlate('A123QBC')?.value ?? 'A123QBC').toBe('A123QBC');
  });
});

