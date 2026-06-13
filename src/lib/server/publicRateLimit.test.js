// src/lib/server/publicRateLimit.test.js
//
// Tests the table-backed rate limiter that protects the public + AI endpoints.
// Mocks the Supabase service client; the query-builder mock resolves the
// row-count for the SELECT and a no-op for INSERT/DELETE.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let countResult = { count: 0, error: null };
  const makeBuilder = () => {
    const b = { _select: false, _insert: false };
    const chain = () => b;
    b.select = vi.fn(() => { b._select = true; return b; });
    b.insert = vi.fn(() => { b._insert = true; return b; });
    b.delete = vi.fn(chain);
    for (const m of ['eq', 'gte', 'lt']) b[m] = vi.fn(chain);
    b.then = (res, rej) => {
      const result = b._insert ? { error: null } : b._select ? countResult : { error: null };
      return Promise.resolve(result).then(res, rej);
    };
    return b;
  };
  const svc = { from: vi.fn(() => makeBuilder()) };
  return { svc, setCount: (n, error = null) => { countResult = { count: n, error }; } };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.svc }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://local' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'svc' } }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { checkKeyRateLimit, checkRateLimit, LIMITS } = await import('./publicRateLimit.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.setCount(0);
});

describe('checkKeyRateLimit', () => {
  it('allows and records the attempt when under the limit', async () => {
    h.setCount(LIMITS.case_submit.max - 1);
    const ok = await checkKeyRateLimit('user:1', 'case_submit');
    expect(ok).toBe(true);
    // an INSERT happened (one of the builders had insert called)
    const inserted = h.svc.from.mock.results.some(r => r.value.insert.mock.calls.length > 0);
    expect(inserted).toBe(true);
  });

  it('blocks (and does not record) when at/over the limit', async () => {
    h.setCount(LIMITS.case_submit.max);
    const ok = await checkKeyRateLimit('user:1', 'case_submit');
    expect(ok).toBe(false);
    const inserted = h.svc.from.mock.results.some(r => r.value.insert.mock.calls.length > 0);
    expect(inserted).toBe(false);
  });

  it('returns true for an unknown action without touching the DB', async () => {
    const ok = await checkKeyRateLimit('user:1', 'not_a_real_action');
    expect(ok).toBe(true);
    expect(h.svc.from).not.toHaveBeenCalled();
  });

  it('fails open (allows) when the count query errors — a DB blip must not lock everyone out', async () => {
    h.setCount(null, { message: 'db down' });
    const ok = await checkKeyRateLimit('user:1', 'case_submit');
    expect(ok).toBe(true);
  });
});

describe('checkRateLimit (IP-based wrapper)', () => {
  it('derives the key from x-forwarded-for and allows under the limit', async () => {
    h.setCount(0);
    const request = { headers: { get: (k) => (k === 'x-forwarded-for' ? '1.2.3.4' : null) } };
    const ok = await checkRateLimit(request, 'photo_upload');
    expect(ok).toBe(true);
  });
});
