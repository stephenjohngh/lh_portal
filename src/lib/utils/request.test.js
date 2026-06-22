// src/lib/utils/request.test.js
// request.js is the authenticated-JSON client for our own /api/* routes. It
// carries the Supabase bearer token, parses JSON, and throws Error(server.error)
// on a non-2xx so callers can just try/catch. Seams mocked: authHeaders, fetch.
// Pins: HTTP verb + headers + body per helper, response parsing, and the
// error-message precedence (server error → fallback → status line).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$lib/utils/authHeaders', () => ({
  authHeaders: () => Promise.resolve({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' }),
}));

const { getJson, postJson, patchJson, del } = await import('./request.js');

function mockFetch(body, { ok = true, status = 200, jsonThrows = false } = {}) {
  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok,
    status,
    json: () => (jsonThrows ? Promise.reject(new Error('not json')) : Promise.resolve(body)),
  }));
}

beforeEach(() => vi.clearAllMocks());

describe('postJson', () => {
  it('POSTs a JSON body with the bearer header and returns the parsed response', async () => {
    mockFetch({ summary: 'ok' });
    const data = await postJson('/api/x', { a: 1, b: 'two' });
    expect(data).toEqual({ summary: 'ok' });

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/x');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toMatchObject({ Authorization: 'Bearer tok' });
    expect(JSON.parse(opts.body)).toEqual({ a: 1, b: 'two' });
  });

  it('sends an empty object body when none is given', async () => {
    mockFetch({});
    await postJson('/api/x');
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({});
  });

  it('throws the server error message on a non-2xx response', async () => {
    mockFetch({ error: 'boom' }, { ok: false, status: 400 });
    await expect(postJson('/api/x', {})).rejects.toThrow('boom');
  });

  it('throws the provided fallback when the body has no error field', async () => {
    mockFetch({}, { ok: false, status: 500 });
    await expect(postJson('/api/x', {}, 'fallback msg')).rejects.toThrow('fallback msg');
  });

  it('falls back to a status line when there is no error field and no fallback', async () => {
    mockFetch({}, { ok: false, status: 503 });
    await expect(postJson('/api/x', {})).rejects.toThrow('Request failed (503)');
  });

  it('tolerates a non-JSON response body (json() rejects)', async () => {
    mockFetch(null, { ok: false, status: 502, jsonThrows: true });
    await expect(postJson('/api/x', {}, 'fb')).rejects.toThrow('fb');
  });
});

describe('getJson', () => {
  it('GETs with the bearer header and no body', async () => {
    mockFetch({ items: [] });
    const data = await getJson('/api/list');
    expect(data).toEqual({ items: [] });
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/list');
    expect(opts?.method).toBeUndefined();          // default GET
    expect(opts.headers).toMatchObject({ Authorization: 'Bearer tok' });
    expect(opts.body).toBeUndefined();
  });
});

describe('patchJson', () => {
  it('PATCHes a JSON body', async () => {
    mockFetch({ updated: true });
    await patchJson('/api/x/1', { field: 'v' });
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ field: 'v' });
  });
});

describe('del', () => {
  it('DELETEs with the bearer header and parses the response', async () => {
    mockFetch({ deleted: true });
    const data = await del('/api/x/1');
    expect(data).toEqual({ deleted: true });
    expect(globalThis.fetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('throws the server error on a non-2xx delete', async () => {
    mockFetch({ error: 'in use' }, { ok: false, status: 409 });
    await expect(del('/api/x/1')).rejects.toThrow('in use');
  });
});
