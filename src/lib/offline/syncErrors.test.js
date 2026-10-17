// The one rule every offline queue uses: retry later, or skip (2026-10-17).
import { describe, it, expect } from 'vitest';
import { classifySyncError } from './syncErrors.js';
import { SESSION_EXPIRED } from '#lib/utils/sessionExpired.js';

describe('classifySyncError', () => {
  it('skips what the server refused: a database rejection, or an HTTP 4xx', () => {
    expect(classifySyncError(Object.assign(new Error('rls'), { code: '42501' })).permanent).toBe(true);
    expect(classifySyncError(Object.assign(new Error('bad'), { status: 400 })).permanent).toBe(true);
  });
  it('retries what might work later: no network, a timeout, a rate limit, a 5xx, an expired session', () => {
    for (const e of [new TypeError('Failed to fetch'), Object.assign(new Error('x'), { status: 408 }),
      Object.assign(new Error('x'), { status: 429 }), Object.assign(new Error('x'), { status: 503 }),
      Object.assign(new Error(SESSION_EXPIRED), { status: 401 })]) {
      expect(classifySyncError(e).permanent).toBe(false);
    }
  });
  it('carries the message as words', () => {
    expect(classifySyncError({ message: 'plain object' }).error).toBe('plain object');
  });
});
