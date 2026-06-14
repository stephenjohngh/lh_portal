// src/routes/api/auth/login/login.test.js
//
// The server-routed login is a security control: it enforces a per-email
// failed-attempt lockout BEFORE forwarding to Supabase Auth, returns generic
// errors (no email enumeration), and fails OPEN if the attempts table is
// unreachable (a DB blip shouldn't lock everyone out). These tests pin that.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let countResult = { count: 0, error: null };
  let signIn      = { data: { user: { id: 'u1', email: 'u@x' }, session: { access_token: 'tok-abcdefghijklmnopqrst' } }, error: null };

  // One fake serves both the anon and admin clients (createClient is called twice).
  const client = {
    auth: { signInWithPassword: vi.fn(() => Promise.resolve(signIn)) },
    from: vi.fn(() => {
      const b = { _select: false, _insert: false };
      const chain = () => b;
      b.select = vi.fn(() => { b._select = true; return b; });
      b.insert = vi.fn(() => { b._insert = true; return b; });
      for (const m of ['eq', 'gt']) b[m] = vi.fn(chain);
      b.then = (res) => Promise.resolve(b._insert ? { error: null } : countResult).then(res);
      return b;
    }),
  };
  return {
    client,
    setCount: (n, error = null) => { countResult = { count: n, error }; },
    setSignIn: (r) => { signIn = r; },
  };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.client }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://local', PUBLIC_SUPABASE_ANON_KEY: 'anon' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'svc' } }));
vi.mock('$lib/server/auditLogger', () => ({
  logLogin:       vi.fn(() => Promise.resolve()),
  logFailedLogin: vi.fn(() => Promise.resolve()),
  getIpAddress:   () => '1.2.3.4',
  getUserAgent:   () => 'test-agent',
}));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');
const req = (body) => ({ json: () => Promise.resolve(body), headers: { get: () => null } });

beforeEach(() => {
  vi.clearAllMocks();
  h.setCount(0);
  h.setSignIn({ data: { user: { id: 'u1', email: 'u@x' }, session: { access_token: 'tok-abcdefghijklmnopqrst' } }, error: null });
});

describe('POST /api/auth/login', () => {
  it('400s when email or password is missing', async () => {
    expect((await POST({ request: req({ email: 'a@b' }) })).status).toBe(400);
  });

  it('locks out (429) once recent failures reach the limit, without calling Supabase Auth', async () => {
    h.setCount(5);                                  // MAX_FAILED_ATTEMPTS
    const res = await POST({ request: req({ email: 'a@b', password: 'x' }) });
    expect(res.status).toBe(429);
    expect(res.body.locked).toBe(true);
    expect(h.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns a generic 401 on bad credentials and records the attempt', async () => {
    h.setSignIn({ data: null, error: { message: 'Invalid login credentials' } });
    const res = await POST({ request: req({ email: 'a@b', password: 'wrong' }) });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');        // no enumeration
    expect(res.body).toHaveProperty('attemptsRemaining');
    // an attempt row was inserted
    const inserted = h.client.from.mock.results.some(r => r.value.insert.mock.calls.length > 0);
    expect(inserted).toBe(true);
  });

  it('returns the session on success', async () => {
    const res = await POST({ request: req({ email: 'u@x', password: 'right' }) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.session.access_token).toBe('tok-abcdefghijklmnopqrst');
    expect(h.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'u@x', password: 'right' });
  });

  it('fails OPEN when the attempts lookup errors (does not lock everyone out)', async () => {
    h.setCount(null, { message: 'db down' });        // count query errors → treated as 0
    const res = await POST({ request: req({ email: 'u@x', password: 'right' }) });
    expect(res.status).toBe(200);                     // proceeds to sign-in
    expect(h.client.auth.signInWithPassword).toHaveBeenCalled();
  });
});
