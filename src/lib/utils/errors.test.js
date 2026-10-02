// src/lib/utils/errors.test.js
import { describe, it, expect } from 'vitest';
import { errMessage } from './errors.js';

describe('errMessage', () => {
  it('reads an Error', () => {
    expect(errMessage(new Error('Boom'))).toBe('Boom');
  });
  // The gap every copy had: a Supabase/PostgREST error is a plain object.
  it('reads a plain object with a message, rather than "[object Object]"', () => {
    expect(errMessage({ message: 'duplicate key value', code: '23505' })).toBe('duplicate key value');
  });
  it('turns anything else into text', () => {
    expect(errMessage('plain text')).toBe('plain text');
    expect(errMessage(42)).toBe('42');
    expect(errMessage(null)).toBe('null');
  });
  it('uses the fallback only when there is no message of its own', () => {
    expect(errMessage(new Error('Boom'), 'Verification failed')).toBe('Boom');
    expect(errMessage({ message: 'Nope' }, 'Verification failed')).toBe('Nope');
    expect(errMessage(undefined, 'Verification failed')).toBe('Verification failed');
    expect(errMessage({}, 'Verification failed')).toBe('Verification failed');
  });
});
