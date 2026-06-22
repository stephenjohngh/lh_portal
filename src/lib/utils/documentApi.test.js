// src/lib/utils/documentApi.test.js
// documentApi.js is the bearer-authed client for the shared document_library
// (/api/documents/*). Seams mocked: supabaseClient (getSession), fetch.
// Pins the non-obvious bits: multipart uploads omit Content-Type (browser sets
// the boundary), query params drop empty values, array meta is JSON-stringified,
// a missing session sends no Authorization header, and parse() throws the
// server error (or fallback) on a non-2xx.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: { access_token: 'tok' },
}));

vi.mock('$lib/supabaseClient', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: h.session } }) } },
}));

const { listDocuments, uploadDocument, deleteDocument, getDocumentUrl, updateDocument } =
  await import('./documentApi.js');

function mockFetch(body, { ok = true, status = 200 } = {}) {
  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok, status, json: () => Promise.resolve(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.session = { access_token: 'tok' };
});

describe('listDocuments', () => {
  it('builds a query string, dropping null/undefined/empty values', async () => {
    mockFetch([{ id: 'd1' }]);
    const out = await listDocuments({ entity_type: 'info_note', entity_id: 'n1', category: '', doc_type: null });
    expect(out).toEqual([{ id: 'd1' }]);

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/documents?entity_type=info_note&entity_id=n1');
    expect(opts.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('throws the fallback message on failure', async () => {
    mockFetch({}, { ok: false, status: 500 });
    await expect(listDocuments()).rejects.toThrow('Failed to load documents');
  });
});

describe('uploadDocument', () => {
  it('POSTs multipart FormData WITHOUT a Content-Type header', async () => {
    mockFetch({ id: 'newdoc' });
    const file = new File(['data'], 'a.pdf', { type: 'application/pdf' });
    const doc  = await uploadDocument(file, { entity_type: 'info_note', entity_id: 'n1', tags: ['a', 'b'] });
    expect(doc).toEqual({ id: 'newdoc' });

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/documents/upload');
    expect(opts.method).toBe('POST');
    // bearer only — the browser must set the multipart boundary itself
    expect(opts.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(opts.headers).not.toHaveProperty('Content-Type');

    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get('entity_type')).toBe('info_note');
    expect(opts.body.get('tags')).toBe('["a","b"]');   // arrays are JSON-stringified
    expect(opts.body.get('file')).toBeInstanceOf(File);
  });

  it('skips null/undefined metadata fields', async () => {
    mockFetch({ id: 'd' });
    const file = new File(['x'], 'x.txt');
    await uploadDocument(file, { entity_id: 'n1', description: null, category: undefined });
    const form = globalThis.fetch.mock.calls[0][1].body;
    expect(form.has('entity_id')).toBe(true);
    expect(form.has('description')).toBe(false);
    expect(form.has('category')).toBe(false);
  });
});

describe('deleteDocument', () => {
  it('DELETEs by id and resolves undefined on success', async () => {
    mockFetch({});
    await expect(deleteDocument('d1')).resolves.toBeUndefined();
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/documents/d1');
    expect(opts.method).toBe('DELETE');
  });
});

describe('getDocumentUrl', () => {
  it('returns the url field from the response', async () => {
    mockFetch({ url: 'https://drive/x' });
    expect(await getDocumentUrl('d1')).toBe('https://drive/x');
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/documents/d1/url');
  });
});

describe('updateDocument', () => {
  it('PATCHes a JSON-wrapped patch with both Content-Type and bearer', async () => {
    mockFetch({ id: 'd1', display_name: 'New' });
    await updateDocument('d1', { display_name: 'New' });
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/documents/d1');
    expect(opts.method).toBe('PATCH');
    expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' });
    expect(JSON.parse(opts.body)).toEqual({ patch: { display_name: 'New' } });
  });
});

describe('bearer header', () => {
  it('sends no Authorization header when there is no session', async () => {
    h.session = null;
    mockFetch([]);
    await listDocuments({ entity_id: 'n1' });
    expect(globalThis.fetch.mock.calls[0][1].headers).toEqual({});
  });
});
