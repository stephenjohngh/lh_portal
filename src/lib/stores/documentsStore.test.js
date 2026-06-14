// src/lib/stores/documentsStore.test.js
// The document-library store talks only to /api/documents/* with a bearer
// header. Pins: load query-param building, upload prepend, updateMeta/remove
// state patching, and error capture. Seams mocked: supabaseClient (auth), fetch.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({
  supabase: { auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'tok' } } })) } },
}));

vi.mock('$lib/supabaseClient', () => ({ supabase: h.supabase }));

const { documentsStore } = await import('./documentsStore.js');

function mockFetch(body, ok = true) {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }));
}

beforeEach(() => { vi.clearAllMocks(); mockFetch([]); });

describe('load', () => {
  it('builds query params from non-empty filters and sends the bearer header', async () => {
    mockFetch([{ id: 'd1' }]);
    await documentsStore.load({ entity_type: 'info_note', entity_id: 'n1', empty: '' });
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/api/documents?');
    expect(url).toContain('entity_type=info_note');
    expect(url).toContain('entity_id=n1');
    expect(url).not.toContain('empty=');           // blank value dropped
    expect(opts.headers).toMatchObject({ Authorization: 'Bearer tok' });
    expect(get(documentsStore).docs).toEqual([{ id: 'd1' }]);
  });

  it('captures the error and clears loading on a non-ok response', async () => {
    mockFetch({ error: 'denied' }, false);
    await documentsStore.load();
    expect(get(documentsStore).error).toBe('denied');
    expect(get(documentsStore).loading).toBe(false);
  });
});

describe('upload', () => {
  it('POSTs multipart to /api/documents/upload and prepends the new doc', async () => {
    mockFetch([{ id: 'd0' }]);
    await documentsStore.load();
    mockFetch({ id: 'd9', filename: 'spec.pdf' });
    const doc = await documentsStore.upload({ name: 'spec.pdf' }, { entity_type: 'issue', tags: ['a', 'b'] });
    const [url, opts] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toBe('/api/documents/upload');
    expect(opts.method).toBe('POST');
    expect(doc.id).toBe('d9');
    expect(get(documentsStore).docs[0].id).toBe('d9');   // prepended
  });

  it('sets the error and rethrows on upload failure', async () => {
    mockFetch({ error: 'too big' }, false);
    await expect(documentsStore.upload({ name: 'x' })).rejects.toThrow('too big');
    expect(get(documentsStore).error).toBe('too big');
  });
});

describe('getUrl', () => {
  it('returns a fresh viewable URL', async () => {
    mockFetch({ url: 'https://cdn/x.pdf' });
    expect(await documentsStore.getUrl('d1')).toBe('https://cdn/x.pdf');
  });
});

describe('updateMeta / remove', () => {
  beforeEach(async () => {
    mockFetch([{ id: 'd1', title: 'old' }, { id: 'd2' }]);
    await documentsStore.load();
  });

  it('updateMeta PATCHes and replaces the row in state', async () => {
    mockFetch({ id: 'd1', title: 'new' });
    await documentsStore.updateMeta('d1', { title: 'new' });
    const [url, opts] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toBe('/api/documents/d1');
    expect(opts.method).toBe('PATCH');
    expect(get(documentsStore).docs.find(d => d.id === 'd1').title).toBe('new');
  });

  it('remove DELETEs and drops the row from state', async () => {
    mockFetch({ success: true });
    await documentsStore.remove('d1');
    expect(get(documentsStore).docs.map(d => d.id)).toEqual(['d2']);
  });
});
