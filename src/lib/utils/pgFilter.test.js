// src/lib/utils/pgFilter.test.js
import { describe, it, expect } from 'vitest';
import { sanitizeIlikeTerm } from './pgFilter.js';

describe('sanitizeIlikeTerm', () => {
  it('preserves ordinary search text incl. emails/names', () => {
    expect(sanitizeIlikeTerm('john.doe@example.com')).toBe('john.doe@example.com');
    expect(sanitizeIlikeTerm('Fire Door FD-42')).toBe('Fire Door FD-42');
  });

  it('removes PostgREST filter grammar (comma/parens/quote/backslash/star)', () => {
    // classic injection attempt: break out of the ilike value and add a condition
    expect(sanitizeIlikeTerm('x,is_admin.eq.true')).toBe('x is_admin.eq.true');
    expect(sanitizeIlikeTerm('a)')).toBe('a');
    expect(sanitizeIlikeTerm('(nested)')).toBe('nested');
    expect(sanitizeIlikeTerm('a"b\\c*d')).toBe('a b c d');
  });

  it('collapses whitespace and trims', () => {
    expect(sanitizeIlikeTerm('  a , b  ')).toBe('a b');
    expect(sanitizeIlikeTerm(',,,')).toBe('');
  });

  it('handles null/undefined', () => {
    expect(sanitizeIlikeTerm(null)).toBe('');
    expect(sanitizeIlikeTerm(undefined)).toBe('');
  });
});
