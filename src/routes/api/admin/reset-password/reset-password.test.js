// src/routes/api/admin/reset-password/reset-password.test.js
// Security endpoint test — requireAdmin gate (mocked), input + password-length
// validation, not-found, and the success path.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const ADMIN_OK = { user: { id: 'admin1', email: 'admin@x' }, isAdmin: true, error: null };

const h = vi.hoisted(() => {
  let authResult, profile;
  const admin = {
    auth: { admin: { updateUserById: vi.fn(() => Promise.resolve({ data: { user: { id: 'u2', email: 't@x' } }, error: null })) } },
    from: vi.fn(() => {
      const b = {};
      for (const m of ['select', 'eq']) b[m] = vi.fn(() => b);
      b.single = vi.fn(() => Promise.resolve({ data: profile }));
      return b;
    }),
  };
  return { admin, getAuth: () => authResult, setAuth: (a) => { authResult = a; }, setProfile: (p) => { profile = p; } };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.admin }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://local' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'svc' } }));
vi.mock('$lib/server/requireAuth', () => ({ requireAdmin: () => Promise.resolve(h.getAuth()) }));
vi.mock('$lib/server/auditLogger', () => ({ logPasswordReset: vi.fn() }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');
const req = (body) => ({ json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.clearAllMocks();
  h.setAuth(ADMIN_OK);
  h.setProfile({ email: 'target@x' });
});

describe('POST /api/admin/reset-password', () => {
  it('returns the requireAdmin error and never resets when not an admin', async () => {
    h.setAuth({ user: null, isAdmin: false, error: { status: 403 } });
    const res = await POST({ request: req({ user_id: 'u2', new_password: 'secret1' }) });
    expect(res.status).toBe(403);
    expect(h.admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('400s when user_id or new_password is missing', async () => {
    expect((await POST({ request: req({ user_id: 'u2' }) })).status).toBe(400);
    expect((await POST({ request: req({ new_password: 'secret1' }) })).status).toBe(400);
  });

  it('400s when the password is shorter than 6 characters', async () => {
    const res = await POST({ request: req({ user_id: 'u2', new_password: 'abc' }) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 6/i);
    expect(h.admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('404s when the target profile does not exist', async () => {
    h.setProfile(null);
    const res = await POST({ request: req({ user_id: 'ghost', new_password: 'secret1' }) });
    expect(res.status).toBe(404);
    expect(h.admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('resets the password and returns success for a valid target', async () => {
    const res = await POST({ request: req({ user_id: 'u2', new_password: 'secret1' }) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(h.admin.auth.admin.updateUserById).toHaveBeenCalledWith('u2', { password: 'secret1' });
  });
});
