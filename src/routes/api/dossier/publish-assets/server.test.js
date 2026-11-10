// src/routes/api/dossier/publish-assets/server.test.js
//
// ⛔ Pinning copies a file the published pack then serves to an outsider.
// Until 2026-10-03 any file in the library was read, so a Dossier author could
// pin a file they may not see — a parking licence — and read it through the
// pack link. A file the caller may not read is now treated like one not in
// the library: left unread. §6ccc item 4.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  docs: /** @type {Record<string, any>} */ ({}),
  readable: new Set(),
  prepareAssets: vi.fn(async (files) => ({ files })),
  pack: /** @type {any} */ (null),
}));

vi.mock('$app/env/public', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('public', { PUBLIC_SUPABASE_URL: 'http://x', PUBLIC_SUPABASE_ANON_KEY: 'k' }));
// The pack is read with the caller's own token (RLS decides), for the folder
// the pinned copies go in (2026-11-09).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.pack, error: null }) }) }) }),
  }),
}));

vi.mock('#lib/server/requireAuth.js', () => ({
  requireAuth: async () => ({ user: { id: 'u1' }, isAdmin: false, error: null }),
}));
vi.mock('#lib/server/publicationAssets.js', () => ({ prepareAssets: h.prepareAssets, MAX_FILES: 40 }));
vi.mock('#lib/server/documentLibrary.js', () => ({
  getDocumentByFileId: async (id) => h.docs[id] ?? null,
}));
vi.mock('#lib/server/documentAccess.js', () => ({
  canAccessDocument: async (doc) => (h.readable.has(doc.id) ? { ok: true } : { ok: false, status: 403, message: 'Not permitted.' }),
  bearerToken: () => 'tok',
}));

const { POST } = await import('./+server.js');

const call = (files, pin = true) => POST(/** @type {any} */ ({
  request: new Request('http://x', { method: 'POST', body: JSON.stringify({ files, pin }) }),
}));

describe('POST /api/dossier/publish-assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.docs = {
      f1: { id: 'd1', entity_type: 'dossier_pack', entity_id: 'p1', provider: 'google_drive' },
      f2: { id: 'd2', entity_type: 'parking_agreement', entity_id: 'pa1', provider: 'google_drive' },
    };
    h.readable = new Set(['d1']);
  });

  it('reads a file whose document the caller may read, from its own provider', async () => {
    await call([{ providerFileId: 'f1' }]);
    expect(h.prepareAssets.mock.calls[0][0]).toEqual([{ providerFileId: 'f1', provider: 'google_drive' }]);
  });

  it('leaves a file the caller may not read unread — never pinned', async () => {
    await call([{ providerFileId: 'f1' }, { providerFileId: 'f2' }]);
    const sent = h.prepareAssets.mock.calls[0][0];
    expect(sent[1].providerFileId).toBe('');
    expect(sent.map((f) => f.providerFileId)).not.toContain('f2');
  });

  it('leaves a file not in the library unread, as before', async () => {
    await call([{ providerFileId: 'nope' }]);
    expect(h.prepareAssets.mock.calls[0][0][0].providerFileId).toBe('');
  });

  it('pins into the pack’s folder only when the caller can read the pack', async () => {
    const pin = (packId) => POST(/** @type {any} */ ({
      request: new Request('http://x', { method: 'POST', body: JSON.stringify({ files: [{ providerFileId: 'f1' }], pin: true, packId }) }),
    }));
    h.pack = null;
    expect((await pin('p1')).status).toBe(403);
    expect(h.prepareAssets).not.toHaveBeenCalled();
    h.pack = { id: 'p1', title: 'My pack' };
    await pin('p1');
    expect(h.prepareAssets.mock.calls[0][1]).toEqual({ pin: true, pack: { id: 'p1', title: 'My pack' } });
  });
});
