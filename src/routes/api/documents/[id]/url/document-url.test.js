// src/routes/api/documents/[id]/url/document-url.test.js
// A URL to the bytes is worth more than the metadata, so this route is gated
// per ENTITY like GET /api/documents/[id] — it used to check only that the
// caller was signed in.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auth: { user: { id: 'u1' }, isAdmin: false, error: null },
  getDocument: vi.fn(),
  getDocumentUrl: vi.fn(() => Promise.resolve('https://file')),
  canAccessDocument: vi.fn(),
}));

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: () => Promise.resolve(h.auth) }));
vi.mock('#lib/server/documentLibrary.js', () => ({ getDocument: h.getDocument, getDocumentUrl: h.getDocumentUrl }));
vi.mock('#lib/server/documentAccess.js', () => ({ canAccessDocument: h.canAccessDocument, bearerToken: () => 'tok' }));

const { GET } = await import('./+server.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.getDocument.mockResolvedValue({ id: 'd1', entity_type: 'parking_agreement', entity_id: 'a1' });
});

describe('GET /api/documents/[id]/url', () => {
  it('refuses, as not found, a document on something the caller cannot read', async () => {
    h.canAccessDocument.mockResolvedValueOnce({ ok: false, status: 403 });
    const res = await GET({ request: {}, params: { id: 'd1' } });
    expect(res.status).toBe(404);
    expect(h.getDocumentUrl).not.toHaveBeenCalled();
  });
  it('returns the URL when the caller can read the entity', async () => {
    h.canAccessDocument.mockResolvedValueOnce({ ok: true });
    const res = await GET({ request: {}, params: { id: 'd1' } });
    expect(res.body).toEqual({ url: 'https://file' });
  });
});
