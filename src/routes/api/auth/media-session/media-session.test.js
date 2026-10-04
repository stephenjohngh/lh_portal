// src/routes/api/auth/media-session/media-session.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ requireAuth: vi.fn() }));

vi.mock('#lib/server/policies.js', async () => { const u = await import('#lib/utils/policies.js'); return { loadServerPolicies: async () => {}, serverPolicy: async (k) => u.policy(k), serverRateLimit: async (a) => u.rateLimit(a) }; });
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'test-secret' } }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: h.requireAuth }));

const { POST, DELETE } = await import('./+server.js');
const { readMediaSession, MEDIA_COOKIE } = await import('#lib/server/mediaAccess.js');

const USER = '11111111-1111-4111-8111-111111111111';

function jar() {
  /** @type {Record<string, any>} */
  const set = {};
  return {
    set,
    cookies: {
      set: (name, value, opts) => { set[name] = { value, opts }; },
      delete: (name, opts) => { set[name] = { deleted: true, opts }; },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/auth/media-session', () => {
  it('sets nothing without a verified token', async () => {
    h.requireAuth.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    const j = jar();
    const res = await POST({ request: new Request('http://x'), cookies: j.cookies });
    expect(res.status).toBe(401);
    expect(j.set[MEDIA_COOKIE]).toBeUndefined();
  });

  it('issues a signed, HttpOnly cookie scoped to the media routes, for the token’s user', async () => {
    h.requireAuth.mockResolvedValue({ user: { id: USER }, error: null });
    const j = jar();
    await POST({ request: new Request('http://x'), cookies: j.cookies });
    const c = j.set[MEDIA_COOKIE];
    expect(readMediaSession(c.value)).toBe(USER);
    expect(c.opts).toMatchObject({ path: '/api/media', httpOnly: true, sameSite: 'lax' });
    expect(c.opts.maxAge).toBeGreaterThan(0);
  });
});

describe('DELETE /api/auth/media-session', () => {
  it('clears the cookie on the same path it was set on', async () => {
    const j = jar();
    await DELETE({ cookies: j.cookies });
    expect(j.set[MEDIA_COOKIE]).toMatchObject({ deleted: true, opts: { path: '/api/media' } });
  });
});
