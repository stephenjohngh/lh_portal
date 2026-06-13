// src/lib/server/requireAuth.test.js
//
// Tests the auth primitive every secured endpoint depends on. Mocks the
// Supabase admin client and the $env virtual modules (which don't resolve
// without the SvelteKit vite plugin). `json` is stubbed to a plain object so
// we can read the status code without constructing real Responses.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const single = vi.fn();                                   // profiles .single()
  const adminClient = {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ single }) }),
    })),
  };
  return { adminClient, single };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.adminClient }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://local' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'svc' } }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { requireAuth, requireAdmin } = await import('./requireAuth.js');

const req = (authHeader) => ({ headers: { get: (k) => (k === 'authorization' && authHeader ? authHeader : null) } });

beforeEach(() => {
  vi.clearAllMocks();
  h.adminClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u@e' } }, error: null });
  h.single.mockResolvedValue({ data: { is_admin: false } });
});

describe('requireAuth', () => {
  it('rejects with 401 when no bearer token is present', async () => {
    const r = await requireAuth(req(null));
    expect(r.user).toBeNull();
    expect(r.error.status).toBe(401);
    expect(h.adminClient.auth.getUser).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the token fails verification', async () => {
    h.adminClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const r = await requireAuth(req('Bearer xyz'));
    expect(r.error.status).toBe(401);
  });

  it('passes the verified token to getUser (not anything from the body)', async () => {
    await requireAuth(req('Bearer the-token'));
    expect(h.adminClient.auth.getUser).toHaveBeenCalledWith('the-token');
  });

  it('returns the user + isAdmin=false for a valid non-admin token', async () => {
    const r = await requireAuth(req('Bearer good'));
    expect(r.error).toBeNull();
    expect(r.user).toEqual({ id: 'u1', email: 'u@e' });
    expect(r.isAdmin).toBe(false);
  });

  it('returns isAdmin=true when the profile is an admin', async () => {
    h.single.mockResolvedValue({ data: { is_admin: true } });
    const r = await requireAuth(req('Bearer good'));
    expect(r.isAdmin).toBe(true);
  });
});

describe('requireAdmin', () => {
  it('forbids (403) an authenticated non-admin', async () => {
    h.single.mockResolvedValue({ data: { is_admin: false } });
    const r = await requireAdmin(req('Bearer good'));
    expect(r.error.status).toBe(403);
    expect(r.user).toBeNull();
  });

  it('passes through the 401 from requireAuth when unauthenticated', async () => {
    const r = await requireAdmin(req(null));
    expect(r.error.status).toBe(401);
  });

  it('allows an admin through', async () => {
    h.single.mockResolvedValue({ data: { is_admin: true } });
    const r = await requireAdmin(req('Bearer good'));
    expect(r.error).toBeNull();
    expect(r.isAdmin).toBe(true);
  });
});
