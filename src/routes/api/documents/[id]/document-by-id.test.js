// src/routes/api/documents/[id]/document-by-id.test.js
//
// GET / PATCH / DELETE /api/documents/[id].
//
// The other way to reach the same data as the list route, and the one that
// matters most: getDocument() selects '*', which includes provider_file_id —
// all anyone needs to pull the bytes from the unauthenticated media proxy.
// Gating the list and leaving this open would have closed the front door only.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auth:  /** @type {any} */ (null),
  admin: /** @type {any} */ (null),
  allowed: /** @type {any} */ ({ ok: true }),
  doc: /** @type {any} */ ({}),
  getDocument:    vi.fn(() => Promise.resolve(h.doc)),
  updateDocument: vi.fn((id, patch) => Promise.resolve({ id, ...patch })),
  deleteDocument: vi.fn(() => Promise.resolve()),
  canAccessDocument: vi.fn(() => Promise.resolve(h.allowed)),
}));

vi.mock('@sveltejs/kit', () => ({
  json: (body, init) => ({ body, status: init?.status ?? 200 }),
}));
vi.mock('$lib/server/documentLibrary', () => ({
  getDocument: h.getDocument,
  updateDocument: h.updateDocument,
  deleteDocument: h.deleteDocument,
}));
vi.mock('$lib/server/requireAuth', () => ({
  requireAuth:  () => Promise.resolve(h.auth),
  requireAdmin: () => Promise.resolve(h.admin),
}));
vi.mock('$lib/server/documentAccess', async () => {
  // The real sanitiser: which columns are editable is the point of the PATCH
  // tests, and stubbing it would test the stub.
  const real = await vi.importActual('$lib/server/documentAccess.js');
  return {
    canAccessDocument: h.canAccessDocument,
    sanitizeDocumentPatch: real.sanitizeDocumentPatch,
    bearerToken: () => 'caller-token',
  };
});
vi.mock('$env/static/public', () => ({
  PUBLIC_SUPABASE_URL: 'http://db.test', PUBLIC_SUPABASE_ANON_KEY: 'anon',
}));

const { GET, PATCH, DELETE } = await import('./+server.js');

const req = (body) => ({
  headers: { get: () => 'Bearer caller-token' },
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  h.auth  = { user: { id: 'u1' }, isAdmin: false, error: null };
  h.admin = { user: { id: 'admin' }, isAdmin: true, error: null };
  h.allowed = { ok: true };
  h.doc = {
    id: 'doc1', entity_type: 'dossier_pack', entity_id: 'p1',
    uploaded_by: 'u1', provider_file_id: 'drive-1', description: 'old',
  };
  h.canAccessDocument.mockImplementation(() => Promise.resolve(h.allowed));
  h.getDocument.mockImplementation(() => Promise.resolve(h.doc));
});

describe('GET', () => {
  it('returns the row when the caller may see its owning entity', async () => {
    const res = await GET({ request: req(), params: { id: 'doc1' } });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('doc1');
  });

  it('says NOT FOUND, not forbidden, when they may not', async () => {
    // A caller must not learn that a document exists by being told they are not
    // allowed to see it.
    h.allowed = { ok: false, status: 403, message: 'Not permitted.' };

    const res = await GET({ request: req(), params: { id: 'doc1' } });

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('drive-1');
  });

  it('never returns the storage id to a caller it refused', async () => {
    h.allowed = { ok: false, status: 403 };
    const res = await GET({ request: req(), params: { id: 'doc1' } });
    expect(JSON.stringify(res.body)).not.toContain('provider_file_id');
  });

  it('refuses an unauthenticated caller before fetching anything', async () => {
    h.auth = { user: null, isAdmin: false, error: { body: {}, status: 401 } };
    const res = await GET({ request: req(), params: { id: 'doc1' } });
    expect(res.status).toBe(401);
    expect(h.getDocument).not.toHaveBeenCalled();
  });
});

describe('PATCH', () => {
  it('updates editable metadata for the uploader', async () => {
    const res = await PATCH({
      request: req({ patch: { description: 'Served by post' } }),
      params: { id: 'doc1' },
    });

    expect(res.status).toBe(200);
    expect(h.updateDocument).toHaveBeenCalledWith(
      'doc1', { description: 'Served by post' }, 'u1');
  });

  it('checks the entity gate BEFORE the ownership check', async () => {
    // Otherwise a stranger learns whether a document exists by which error they
    // get: 403 for "not yours" tells them it is real.
    h.allowed = { ok: false, status: 403 };
    h.doc = { ...h.doc, uploaded_by: 'someone-else' };

    const res = await PATCH({
      request: req({ patch: { description: 'x' } }), params: { id: 'doc1' } });

    expect(res.status).toBe(404);
  });

  it('refuses someone else-s document even when they can see the entity', async () => {
    h.doc = { ...h.doc, uploaded_by: 'someone-else' };

    const res = await PATCH({
      request: req({ patch: { description: 'x' } }), params: { id: 'doc1' } });

    expect(res.status).toBe(403);
    expect(h.updateDocument).not.toHaveBeenCalled();
  });

  it('lets an admin edit a document they did not upload', async () => {
    h.auth = { user: { id: 'admin' }, isAdmin: true, error: null };
    h.doc = { ...h.doc, uploaded_by: 'someone-else' };

    const res = await PATCH({
      request: req({ patch: { description: 'x' } }), params: { id: 'doc1' } });

    expect(res.status).toBe(200);
  });

  it('rejects the columns authorisation is decided BY', async () => {
    // Rewriting entity_type/entity_id would attach this file to somebody else's
    // pack, and it would then be listed on their shelf.
    const res = await PATCH({
      request: req({ patch: { entity_id: 'victim-pack' } }), params: { id: 'doc1' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('entity_id');
    expect(h.updateDocument).not.toHaveBeenCalled();
  });

  it('rejects storage identity and the drift baseline', async () => {
    for (const field of ['provider_file_id', 'file_checksum', 'file_size']) {
      const res = await PATCH({
        request: req({ patch: { [field]: 'x' } }), params: { id: 'doc1' } });
      expect(res.status).toBe(400);
    }
  });

  it('refuses a patch that would change nothing', async () => {
    const res = await PATCH({ request: req({ patch: {} }), params: { id: 'doc1' } });
    expect(res.status).toBe(400);
    expect(h.updateDocument).not.toHaveBeenCalled();
  });
});

describe('DELETE', () => {
  it('is admin only', async () => {
    h.admin = { user: null, isAdmin: false, error: { body: { error: 'Forbidden' }, status: 403 } };

    const res = await DELETE({ request: req(), params: { id: 'doc1' } });

    expect(res.status).toBe(403);
    expect(h.deleteDocument).not.toHaveBeenCalled();
  });

  it('deletes the file and the row for an admin', async () => {
    const res = await DELETE({ request: req(), params: { id: 'doc1' } });

    expect(res.status).toBe(200);
    expect(h.deleteDocument).toHaveBeenCalledWith('doc1');
  });

  it('reports a failure rather than claiming success', async () => {
    h.deleteDocument.mockRejectedValueOnce(new Error('drive unavailable'));

    const res = await DELETE({ request: req(), params: { id: 'doc1' } });

    expect(res.status).toBe(500);
    expect(res.body.ok).toBeUndefined();
  });
});
