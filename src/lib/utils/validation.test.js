// src/lib/utils/validation.test.js
import { describe, it, expect } from 'vitest';
import { isRequired, isValidEmail } from './validation.js';

describe('isRequired', () => {
  it('rejects null, undefined and whitespace-only strings', () => {
    expect(isRequired(null)).toBe(false);
    expect(isRequired(undefined)).toBe(false);
    expect(isRequired('   ')).toBe(false);
  });
  it('accepts non-empty strings and non-string values', () => {
    expect(isRequired('x')).toBe(true);
    expect(isRequired(0)).toBe(true);
    expect(isRequired(false)).toBe(true);
  });
});

describe('isValidEmail', () => {
  it('accepts a normal address and rejects malformed ones', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user@example')).toBe(false);
    expect(isValidEmail('user example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});
