// src/lib/utils/morVerificationCode.test.js
import { describe, it, expect } from 'vitest';
import {
  generateVerificationCode, formatVerificationCode,
  normalizeVerificationCode, isValidVerificationCode,
} from './morVerificationCode.js';

describe('generateVerificationCode', () => {
  it('always produces a valid 6-char code from the safe alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateVerificationCode();
      expect(code).toHaveLength(6);
      expect(isValidVerificationCode(code)).toBe(true);
      // Ambiguous characters are excluded from the alphabet
      expect(code).not.toMatch(/[ILO01]/);
    }
  });
});

describe('formatVerificationCode', () => {
  it('inserts a dash after the third character', () => {
    expect(formatVerificationCode('R7PQK2')).toBe('R7P-QK2');
  });
  it('passes through non-canonical input unchanged', () => {
    expect(formatVerificationCode('R7P')).toBe('R7P');
    expect(formatVerificationCode(null)).toBe('');
  });
});

describe('normalizeVerificationCode', () => {
  it('accepts dashed, spaced and lowercase variants', () => {
    expect(normalizeVerificationCode('r7p-qk2')).toBe('R7PQK2');
    expect(normalizeVerificationCode('R7P QK2')).toBe('R7PQK2');
    expect(normalizeVerificationCode('R7PQK2')).toBe('R7PQK2');
  });
  it('returns empty string when input cannot be coerced to 6 chars', () => {
    expect(normalizeVerificationCode('R7PQK')).toBe('');     // too short
    expect(normalizeVerificationCode('R7PQK22')).toBe('');   // 7 valid chars — too long
    expect(normalizeVerificationCode('r7pqk1')).toBe('');    // '1' stripped → 5 chars
    expect(normalizeVerificationCode(null)).toBe('');
  });
  it('strips excluded look-alike chars rather than keeping them', () => {
    // '1' is not in the alphabet; stripping it leaves a valid 6-char code
    expect(normalizeVerificationCode('R7PQK21')).toBe('R7PQK2');
  });
});

describe('isValidVerificationCode', () => {
  it('accepts only the canonical stored form', () => {
    expect(isValidVerificationCode('R7PQK2')).toBe(true);
    expect(isValidVerificationCode('r7pqk2')).toBe(false);  // lowercase
    expect(isValidVerificationCode('R7PQKI')).toBe(false);  // I not in alphabet
    expect(isValidVerificationCode('R7P-K2')).toBe(false);  // separator
    expect(isValidVerificationCode(null)).toBe(false);
  });
});
