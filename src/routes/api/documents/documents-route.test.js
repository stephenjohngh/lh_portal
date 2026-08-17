// src/routes/api/documents/documents-route.test.js
//
// GET /api/documents — the LIST route.
//
// documentAccess.test.js proves the decision is right. This proves the route
// actually asks: the listing runs with the SERVICE ROLE, so RLS does not apply
// and the gate here is the only thing between a signed-in user and any entity's
// attachments in the portal. A refactor that dropped the call would leave
// documentAccess.test.js entirely green.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auth: /** @type {any} */ (null),
  allowed: /** @type {any} */ ({ ok: true }),
  listDocuments: vi.fn(() => Promise.resolve([{ id: 'doc1' }])),
  canListDocuments: vi.fn(() => Promise.resolve(h.allowed)),
}));

vi.mock('@sveltejs/kit', () => ({
  json: (body, init) => ({ body, status: init?.status ?? 200 }),
}));
vi.mock('$lib/server/documentLibrary', () => ({ listDocuments: h.listDocuments }));
vi.mock('$lib/server/requireAuth', () => ({ requireAuth: () => Promise.resolve(h.auth) }));
vi.mock('$lib/server/documentAccess', () => ({
  canListDocuments: h.canListDocuments,
  bearerToken: () => 'caller-token',
}));

const { GET } = await import('./+server.js');

const req = () => ({ headers: { get: () => 'Bearer caller-token' } });
const url = (params = {}) => ({
  searchParams: { get: (k) => params[k] ?? null },
});

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { user: { id: 'u1' }, isAdmin: false, error: null };
  h.allowed = { ok: true };
  h.canListDocuments.mockImplementation(() => Promise.resolve(h.allowed));
});

describe('GET /api/documents', () => {
  it('refuses before doing anything when the caller is not signed in', async () => {
    h.auth = { user: null, isAdmin: false, error: { body: { error: 'Unauthorized' }, status: 401 } };

    const res = await GET({ request: req(), url: url() });

    expect(res.status).toBe(401);
    expect(h.listDocuments).not.toHaveBeenCalled();
  });

  it('asks the entity gate, and passes the caller-s OWN token to it', async () => {
    // The gate re-asks the database as the caller so their RLS applies. Handing
    // it anything else — a service token, an id from the query — would make it
    // answer a different question and always say yes.
    await GET({ request: req(), url: url({ entity_type: 'dossier_pack', entity_id: 'p1' }) });

    expect(h.canListDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ entity_type: 'dossier_pack', entity_id: 'p1' }),
      { isAdmin: false, token: 'caller-token' });
  });

  it('does NOT read the library when the gate refuses', async () => {
    // The whole hole this closes: filenames, descriptions and storage ids of
    // another user's confidential shelf must never be fetched, let alone
    // returned.
    h.allowed = { ok: false, status: 403, message: 'Not permitted.' };

    const res = await GET({ request: req(), url: url({ entity_type: 'dossier_pack', entity_id: 'theirs' }) });

    expect(res.status).toBe(403);
    expect(h.listDocuments).not.toHaveBeenCalled();
  });

  it('carries the gate-s own status rather than flattening every refusal', async () => {
    h.allowed = { ok: false, status: 401, message: 'Unauthorized' };
    const res = await GET({ request: req(), url: url({ entity_type: 'issue', entity_id: 'i1' }) });
    expect(res.status).toBe(401);
  });

  it('returns the documents when the gate allows', async () => {
    const res = await GET({ request: req(), url: url({ entity_type: 'issue', entity_id: 'i1' }) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'doc1' }]);
  });

  it('passes the filters through, leaving absent ones undefined', async () => {
    // Not '' — an empty string is a filter that matches nothing, which would
    // silently empty every panel.
    await GET({ request: req(), url: url({ entity_type: 'info_note', entity_id: 'n1' }) });

    const opts = h.listDocuments.mock.calls[0][0];
    expect(opts.entity_type).toBe('info_note');
    expect(opts.doc_type).toBeUndefined();
    expect(opts.search).toBeUndefined();
  });

  it('does not let a storage failure look like an empty shelf', async () => {
    // An empty list reads as "this entity has no documents", which is a lie
    // that hides a broken storage layer.
    h.listDocuments.mockRejectedValueOnce(new Error('db down'));

    const res = await GET({ request: req(), url: url({ entity_type: 'issue', entity_id: 'i1' }) });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('db down');
  });
});
