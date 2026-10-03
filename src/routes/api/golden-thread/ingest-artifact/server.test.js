// src/routes/api/golden-thread/ingest-artifact/server.test.js
//
// ⛔ The copy runs with the service role. Until 2026-10-03 the route checked
// the TARGET draft (exists, still a draft, the caller's own) and never the
// SOURCE — so a Golden Thread draft could take in any library document, a
// parking licence included, and its owner could then read it there.
// §6ccc item 4.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://localhost' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'service-role' } }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const h = vi.hoisted(() => ({
  draft:   { id: '22222222-2222-4222-8222-222222222222', status: 'draft', created_by: 'u1' },
  source:  { id: '11111111-1111-4111-8111-111111111111', entity_type: 'parking_agreement', entity_id: 'pa1' },
  sourceError: null,
  allowed: { ok: true },
  copyDocument: vi.fn(async () => ({ id: 'copy', file_checksum: 'abc', file_size: 3, mime_type: 'application/pdf' })),
  canAccessDocument: vi.fn(async () => h.allowed),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.draft, error: null }) }) }) }),
  }),
}));
vi.mock('$lib/server/requireAuth', () => ({
  requireAuth: async () => ({ user: { id: 'u1' }, isAdmin: false, error: null }),
}));
vi.mock('$lib/server/documentLibrary', () => ({
  copyDocument: h.copyDocument,
  getDocument:  async () => { if (h.sourceError) throw h.sourceError; return h.source; },
}));
vi.mock('$lib/server/documentAccess.js', () => ({
  canAccessDocument: h.canAccessDocument,
  bearerToken: () => 'tok',
}));

const { POST } = await import('./+server.js');

const call = () => POST(/** @type {any} */ ({
  request: new Request('http://x', {
    method: 'POST',
    headers: { authorization: 'Bearer tok' },
    body: JSON.stringify({ sourceDocId: h.source.id, entityId: h.draft.id }),
  }),
}));

describe('POST /api/golden-thread/ingest-artifact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.allowed = { ok: true };
    h.sourceError = null;
  });

  it('refuses a source document the caller may not read, and copies nothing', async () => {
    h.allowed = { ok: false, status: 403, message: 'Not permitted.' };
    const res = await call();
    expect(res.status).toBe(403);
    expect(h.copyDocument).not.toHaveBeenCalled();
    expect(h.canAccessDocument).toHaveBeenCalledWith(h.source, { isAdmin: false, token: 'tok' });
  });

  it('copies a source the caller may read', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.copyDocument).toHaveBeenCalled();
  });

  it('says not found for a source that does not exist', async () => {
    h.sourceError = { code: 'PGRST116', message: 'no rows' };
    const res = await call();
    expect(res.status).toBe(404);
    expect(h.copyDocument).not.toHaveBeenCalled();
  });

  it('a failed lookup is a failure, not "not found"', async () => {
    h.sourceError = { code: '08006', message: 'connection lost' };
    const res = await call();
    expect(res.status).toBe(500);
    expect(h.copyDocument).not.toHaveBeenCalled();
  });
});
