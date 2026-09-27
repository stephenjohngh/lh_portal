// src/routes/api/documents/check/check-route.test.js
// POST /api/documents/check — admin only, at most 200, and the rows are read
// on the server from the ids given, never taken from the caller.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auth: /** @type {any} */ (null),
  checkDocumentsById: vi.fn(async (ids) => Object.fromEntries(ids.map((id) => [id, { owner: 'present', file: 'present' }]))),
}));

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('$lib/server/documentLibrary', () => ({ checkDocumentsById: h.checkDocumentsById }));
vi.mock('$lib/server/requireAuth', () => ({ requireAdmin: async () => h.auth }));

const { POST } = await import('./+server.js');
const call = (body) => POST({ request: { json: async () => body } });

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { user: { id: 'u1' }, isAdmin: true, error: null };
});

describe('POST /api/documents/check', () => {
  it('checks the ids given, once each', async () => {
    const res = await call({ ids: ['a', 'b', 'a', 7, ''] });
    expect(res.status).toBe(200);
    expect(h.checkDocumentsById).toHaveBeenCalledWith(['a', 'b']);
    expect(Object.keys(res.body.results)).toEqual(['a', 'b']);
    expect(res.body.checkedAt).toBeTruthy();
  });

  it('is admin only', async () => {
    h.auth = { user: null, isAdmin: false, error: { body: { error: 'Forbidden' }, status: 403 } };
    expect((await call({ ids: ['a'] })).status).toBe(403);
    expect(h.checkDocumentsById).not.toHaveBeenCalled();
  });

  it('refuses more than 200 at once', async () => {
    const res = await call({ ids: Array.from({ length: 201 }, (_, i) => `d${i}`) });
    expect(res.status).toBe(400);
    expect(h.checkDocumentsById).not.toHaveBeenCalled();
  });

  it('says the check did not finish, rather than returning a partial answer', async () => {
    h.checkDocumentsById.mockRejectedValueOnce(new Error('Could not check issues: boom'));
    const res = await call({ ids: ['a'] });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/could not finish.*boom/);
  });
});
