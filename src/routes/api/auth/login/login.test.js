// src/routes/api/auth/login/login.test.js
//
// The server-routed login is a security control: it enforces a failed-attempt
// lockout (5 per email from one address, 20 per email from anywhere —
// #lib/server/loginLockout.js) BEFORE forwarding to Supabase Auth, returns generic
// errors (no email enumeration), and fails OPEN if the attempts table is
// unreachable (a DB blip shouldn't lock everyone out). These tests pin that.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  // The failed attempts the lookup returns, one row per failure.
  let failures = { data: [], error: null };
  let signIn      = { data: { user: { id: 'u1', email: 'u@x' }, session: { access_token: 'tok-abcdefghijklmnopqrst' } }, error: null };

  // One fake serves both the anon and admin clients (createClient is called twice).
  const client = {
    auth: { signInWithPassword: vi.fn(() => Promise.resolve(signIn)) },
    from: vi.fn(() => {
      const b = { _select: false, _insert: false };
      const chain = () => b;
      b.select = vi.fn(() => { b._select = true; return b; });
      b.insert = vi.fn(() => { b._insert = true; return b; });
      for (const m of ['eq', 'gt', 'limit']) b[m] = vi.fn(chain);
      b.then = (res) => Promise.resolve(b._insert ? { error: null } : failures).then(res);
      return b;
    }),
  };
  return {
    client,
    setFailures: (ips, error = null) => { failures = { data: error ? null : ips.map((ip) => ({ ip_address: ip })), error }; },
    setSignIn: (r) => { signIn = r; },
  };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.client }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://local', PUBLIC_SUPABASE_ANON_KEY: 'anon' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'svc' } }));
vi.mock('#lib/server/auditLogger.js', () => ({
  logLogin:       vi.fn(() => Promise.resolve()),
  logFailedLogin: vi.fn(() => Promise.resolve()),
  getIpAddress:   () => '1.2.3.4',
  getUserAgent:   () => 'test-agent',
}));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');
const req = (body) => ({ json: () => Promise.resolve(body), headers: { get: () => null } });
// The caller's address as the platform reports it (getClientAddress).
const from = (ip) => () => ip;

beforeEach(() => {
  vi.clearAllMocks();
  h.setFailures([]);
  h.setSignIn({ data: { user: { id: 'u1', email: 'u@x' }, session: { access_token: 'tok-abcdefghijklmnopqrst' } }, error: null });
});

describe('POST /api/auth/login', () => {
  it('400s when email or password is missing', async () => {
    expect((await POST({ request: req({ email: 'a@b' }) })).status).toBe(400);
  });

  it('locks out (429) after five failures from this address, without calling Supabase Auth', async () => {
    h.setFailures(Array(5).fill('1.2.3.4'));
    const res = await POST({ request: req({ email: 'a@b', password: 'x' }), getClientAddress: from('1.2.3.4') });
    expect(res.status).toBe(429);
    expect(res.body.locked).toBe(true);
    expect(h.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  // The security review's finding: five wrong passwords from ANYWHERE locked
  // the real owner out. A stranger's failures no longer do.
  it("lets the owner in from elsewhere after a stranger's five failures", async () => {
    h.setFailures(Array(5).fill('6.6.6.6'));
    const res = await POST({ request: req({ email: 'u@x', password: 'right' }), getClientAddress: from('1.2.3.4') });
    expect(res.status).toBe(200);
  });

  it('still locks after twenty failures from anywhere', async () => {
    h.setFailures(Array.from({ length: 20 }, (_, i) => `10.0.0.${i}`));
    const res = await POST({ request: req({ email: 'u@x', password: 'right' }), getClientAddress: from('1.2.3.4') });
    expect(res.status).toBe(429);
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

  // ⛔ The incident of 2026-09-30: the Email provider was switched off, every
  // sign-in came back 422, and the admin was told their password was wrong —
  // and locked out by the retries. The password was never checked.
  it('email logins switched off: says so, and neither reads as nor counts as a wrong password', async () => {
    h.setSignIn({ data: null, error: { status: 422, code: 'email_provider_disabled', message: 'Email logins are disabled' } });
    const res = await POST({ request: req({ email: 'u@x', password: 'right' }) });
    expect(res.status).toBe(503);
    expect(res.body.error).not.toBe('Invalid email or password');
    expect(res.body.error).toMatch(/not checked/i);
    expect(res.body.passwordChecked).toBe(false);
    expect(res.body).not.toHaveProperty('attemptsRemaining');
    const inserted = h.client.from.mock.results.some(r => r.value.insert.mock.calls.length > 0);
    expect(inserted).toBe(false);                      // not a failed attempt
  });

  it('a thrown sign-in (network, SDK) is answered, not a bare 500, and does not count', async () => {
    h.client.auth.signInWithPassword.mockImplementationOnce(() => Promise.reject(new Error('fetch failed')));
    const res = await POST({ request: req({ email: 'u@x', password: 'right' }) });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not checked/i);
    const inserted = h.client.from.mock.results.some(r => r.value.insert.mock.calls.length > 0);
    expect(inserted).toBe(false);
  });

  it('a wrong password with the current error code still counts', async () => {
    h.setSignIn({ data: null, error: { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } });
    const res = await POST({ request: req({ email: 'a@b', password: 'wrong' }) });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
    const inserted = h.client.from.mock.results.some(r => r.value.insert.mock.calls.length > 0);
    expect(inserted).toBe(true);
  });

  it('records a successful sign-in', async () => {
    await POST({ request: req({ email: 'u@x', password: 'right' }) });
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
    h.setFailures([], { message: 'db down' });       // lookup errors → treated as none
    const res = await POST({ request: req({ email: 'u@x', password: 'right' }) });
    expect(res.status).toBe(200);                     // proceeds to sign-in
    expect(h.client.auth.signInWithPassword).toHaveBeenCalled();
  });
});
