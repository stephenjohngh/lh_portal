// src/lib/utils/permissions.test.js
// canDeleteOwn mirrors the RLS "admin OR (owner AND within grace window)" policy
// from migration 124. The grace arithmetic is the part worth pinning.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { canDeleteOwn } from './permissions.js';

const NOW = new Date('2026-06-14T12:00:00Z').getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();
const HOUR = 3_600_000;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(()  => { vi.useRealTimers(); });

describe('canDeleteOwn', () => {
  it('admins can always delete, regardless of owner or age', () => {
    expect(canDeleteOwn({ created_by: 'someone-else', created_at: ago(10 * HOUR) }, 'me', true)).toBe(true);
    expect(canDeleteOwn(null, null, true)).toBe(true);
  });

  it('the owner can delete inside the 2h grace window', () => {
    expect(canDeleteOwn({ created_by: 'me', created_at: ago(1 * HOUR) }, 'me', false)).toBe(true);
  });

  it('the owner cannot delete after the grace window', () => {
    expect(canDeleteOwn({ created_by: 'me', created_at: ago(3 * HOUR) }, 'me', false)).toBe(false);
  });

  it('a non-owner (non-admin) can never delete', () => {
    expect(canDeleteOwn({ created_by: 'someone-else', created_at: ago(1 * HOUR) }, 'me', false)).toBe(false);
  });

  it('returns false for missing record, user, or created_at', () => {
    expect(canDeleteOwn(null, 'me', false)).toBe(false);
    expect(canDeleteOwn({ created_by: 'me', created_at: ago(HOUR) }, null, false)).toBe(false);
    expect(canDeleteOwn({ created_by: 'me', created_at: null }, 'me', false)).toBe(false);
  });

  it('rejects a future created_at (negative age)', () => {
    expect(canDeleteOwn({ created_by: 'me', created_at: new Date(NOW + HOUR).toISOString() }, 'me', false)).toBe(false);
  });

  it('honours a custom grace window', () => {
    const rec = { created_by: 'me', created_at: ago(5 * HOUR) };
    expect(canDeleteOwn(rec, 'me', false, 6)).toBe(true);   // within 6h
    expect(canDeleteOwn(rec, 'me', false, 4)).toBe(false);  // outside 4h
  });
});
