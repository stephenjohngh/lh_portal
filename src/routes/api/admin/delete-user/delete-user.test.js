// src/routes/api/admin/delete-user/delete-user.test.js
// Security endpoint test — requireAdmin gate (mocked), the self-delete guard,
// the not-found path, and the success path.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const ADMIN_OK = { user: { id: 'admin1', email: 'admin@x' }, isAdmin: true, error: null };

const h = vi.hoisted(() => {
  let authResult, profile;
  const admin = {
    auth: { admin: { deleteUser: vi.fn(() => Promise.resolve({ error: null })) } },
    from: vi.fn(() => {
      const b = {};
      for (const m of ['select', 'update', 'delete', 'eq']) b[m] = vi.fn(() => b);
      b.single = vi.fn(() => Promise.resolve({ data: profile }));
      b.then = (res) => Promise.resolve({ error: null }).then(res);
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
vi.mock('$lib/server/auditLogger', () => ({ logDelete: vi.fn() }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');
const req = (body) => ({ json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.clearAllMocks();
  h.setAuth(ADMIN_OK);
  h.setProfile({ email: 'target@x', full_name: 'T', is_admin: false, created_at: '2026-01-01' });
});

describe('POST /api/admin/delete-user', () => {
  it('returns the requireAdmin error and never deletes when not an admin', async () => {
    h.setAuth({ user: null, isAdmin: false, error: { status: 401 } });
    const res = await POST({ request: req({ user_id: 'u2' }) });
    expect(res.status).toBe(401);
    expect(h.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('400s when user_id is missing', async () => {
    const res = await POST({ request: req({}) });
    expect(res.status).toBe(400);
  });

  it('blocks self-deletion (admin deleting their own id)', async () => {
    const res = await POST({ request: req({ user_id: 'admin1' }) });   // same as ADMIN_OK.user.id
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/your own account/i);
    expect(h.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('404s when the target profile does not exist', async () => {
    h.setProfile(null);
    const res = await POST({ request: req({ user_id: 'ghost' }) });
    expect(res.status).toBe(404);
    expect(h.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('deletes the auth user and returns success for a valid target', async () => {
    const res = await POST({ request: req({ user_id: 'u2' }) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(h.admin.auth.admin.deleteUser).toHaveBeenCalledWith('u2');
  });
});
