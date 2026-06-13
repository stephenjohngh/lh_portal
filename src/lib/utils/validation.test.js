// src/lib/utils/validation.test.js
import { describe, it, expect } from 'vitest';
import {
  isRequired, isValidEmail, isValidLength, isValidUrl,
  isInRange, isValidPhone, isPositiveNumber, isInteger, createValidator,
} from './validation.js';

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

describe('isValidLength', () => {
  it('checks bounds inclusively', () => {
    expect(isValidLength('abc', 1, 3)).toBe(true);
    expect(isValidLength('abcd', 1, 3)).toBe(false);
  });
  it('empty value is valid only when min is 0', () => {
    expect(isValidLength('', 0, 5)).toBe(true);
    expect(isValidLength('', 1, 5)).toBe(false);
    expect(isValidLength(null, 0, 5)).toBe(true);
  });
});

describe('isValidUrl', () => {
  it('accepts absolute URLs and rejects bare strings', () => {
    expect(isValidUrl('https://example.com/path')).toBe(true);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('isInRange', () => {
  it('coerces numeric strings and checks bounds inclusively', () => {
    expect(isInRange('5', 1, 10)).toBe(true);
    expect(isInRange(10, 1, 10)).toBe(true);
    expect(isInRange(11, 1, 10)).toBe(false);
    expect(isInRange('abc', 1, 10)).toBe(false);
    expect(isInRange(null, 1, 10)).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts 10-15 digits with common separators', () => {
    expect(isValidPhone('020 7946 0958')).toBe(true);
    expect(isValidPhone('(020) 7946-0958')).toBe(true);
  });
  it('rejects too few digits or letters', () => {
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('phone me')).toBe(false);
  });
});

describe('isPositiveNumber / isInteger', () => {
  it('isPositiveNumber requires > 0', () => {
    expect(isPositiveNumber(1)).toBe(true);
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(-2)).toBe(false);
  });
  it('isInteger accepts whole numbers only', () => {
    expect(isInteger(3)).toBe(true);
    expect(isInteger('3')).toBe(true);
    expect(isInteger(3.5)).toBe(false);
  });
});

describe('createValidator', () => {
  it('aggregates failing rule messages', () => {
    const validate = createValidator([
      { validate: isRequired, message: 'Required' },
      { validate: v => isValidLength(v, 3), message: 'Too short' },
    ]);
    expect(validate('ab')).toEqual({ isValid: false, errors: ['Too short'] });
    expect(validate('')).toEqual({ isValid: false, errors: ['Required', 'Too short'] });
    expect(validate('abc')).toEqual({ isValid: true, errors: [] });
  });
});
