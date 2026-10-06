import { describe, it, expect } from 'vitest';
import { jpegToPdf } from './jpegPdf.js';

// Not a real picture — the writer copies JPEG bytes in untouched, so any bytes
// with the JPEG start and end markers test it.
const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5, 0xFF, 0xD9]);
const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('jpegToPdf', () => {
  const pdf = jpegToPdf(JPEG, 2480, 3508, { title: 'Parking permit (100)' });
  const text = latin1(pdf);

  it('is a PDF with one A4 page', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(text).toContain('/Count 1');
  });

  it('carries the JPEG bytes unchanged, declared at their pixel size', () => {
    expect(text).toContain(latin1(JPEG));
    expect(text).toMatch(/\/Width 2480 \/Height 3508 .*\/Filter \/DCTDecode \/Length 11 >>/);
  });

  it('has a cross-reference table whose offsets point at each object', () => {
    const start = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const offsets = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(6);
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it('escapes the title', () => {
    expect(text).toContain('/Title (Parking permit \\(100\\))');
  });

  it('refuses what is not a JPEG, and a missing size', () => {
    expect(() => jpegToPdf(new Uint8Array([0x89, 0x50, 0x4E, 0x47]), 10, 10)).toThrow(/not a JPEG/);
    expect(() => jpegToPdf(JPEG, 0, 10)).toThrow(/size/);
  });
});
