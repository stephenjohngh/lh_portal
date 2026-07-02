// src/routes/api/admin/create-user/create-user.test.js
//
// Security endpoint test. The requireAdmin gate is mocked here (it has its own
// tests in src/lib/server/requireAuth.test.js); we drive the auth outcome to
// assert THIS endpoint's branches: gate rejection, input validation, and the
// success path calling the Supabase admin API.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const ADMIN_OK = { user: { id: 'admin1', email: 'admin@x' }, isAdmin: true, error: null };

const h = vi.hoisted(() => {
  let authResult;
  const admin = {
    auth: { admin: { createUser: vi.fn() } },
    from: vi.fn(() => {
      const b = {};
      for (const m of ['select', 'update', 'delete', 'eq']) b[m] = vi.fn(() => b);
      b.then = (res) => Promise.resolve({ error: null }).then(res);
      return b;
    }),
  };
  return { admin, getAuth: () => authResult, setAuth: (a) => { authResult = a; } };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.admin }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://local' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'svc' } }));
vi.mock('$lib/server/requireAuth', () => ({ requireAdmin: () => Promise.resolve(h.getAuth()) }));
vi.mock('$lib/server/auditLogger', () => ({ logCreate: vi.fn() }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');
const req = (body) => ({ json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.clearAllMocks();
  h.setAuth(ADMIN_OK);
  h.admin.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'u9', email: 'new@x' } }, error: null });
});

describe('POST /api/admin/create-user', () => {
  it('returns the requireAdmin error (e.g. 403) and never calls Supabase when not an admin', async () => {
    h.setAuth({ user: null, isAdmin: false, error: { status: 403 } });
    const res = await POST({ request: req({ email: 'a@b', password: 'x' }) });
    expect(res.status).toBe(403);
    expect(h.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('400s when email or password is missing', async () => {
    const res = await POST({ request: req({ email: '', password: '' }) });
    expect(res.status).toBe(400);
    expect(h.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('400s a password under 6 characters, before calling Supabase (A2)', async () => {
    const res = await POST({ request: req({ email: 'new@x', password: 'pw' }) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 6/i);
    expect(h.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('creates the user (email_confirm) and returns success for an admin', async () => {
    const res = await POST({ request: req({ email: 'new@x', password: 'secret1', full_name: 'New User' }) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(h.admin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@x', email_confirm: true }),
    );
  });

  it('400s with the Supabase error message when creation fails', async () => {
    h.admin.auth.admin.createUser.mockResolvedValue({ data: null, error: { message: 'Email exists' } });
    const res = await POST({ request: req({ email: 'dup@x', password: 'secret1' }) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email exists');
  });
});
