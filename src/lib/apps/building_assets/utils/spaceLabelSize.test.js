import { describe, it, expect } from 'vitest';
import { SPACE_LABEL_SIZES, spaceLabelPx, spaceLabelSizeName } from './spaceLabelSize.js';

describe('space label sizes', () => {
  it('normal keeps the size every label has today; each step is one smaller', () => {
    expect(spaceLabelPx('normal', 12)).toBe(12);
    expect(spaceLabelPx('small', 12)).toBe(11);
    expect(spaceLabelPx('smaller', 12)).toBe(10);
    expect(spaceLabelPx('smallest', 12)).toBe(9);
    expect(spaceLabelPx('small', 11)).toBe(10);   // the phone viewer's own base
  });
  it('a missing or unknown size reads as normal, never smaller', () => {
    expect(spaceLabelPx(undefined, 12)).toBe(12);
    expect(spaceLabelPx('huge', 12)).toBe(12);
    expect(spaceLabelSizeName(null)).toBe('Normal');
  });
  it('offers exactly the values the database accepts (migrations 242–243)', () => {
    expect(SPACE_LABEL_SIZES.map(s => s.value)).toEqual(['normal', 'small', 'smaller', 'smallest']);
  });
});
