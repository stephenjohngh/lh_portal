// src/lib/utils/mediaAttachments.test.js
// Shared access to the polymorphic media_attachments table. Seams mocked:
// supabaseClient (from()-builder + auth) and global fetch.
//
// ⛔ WHAT THESE NOW PIN, BEYOND THE OLD SHAPES. Every row must record WHICH
// PROVIDER wrote it, and purge must hand that provider to the server rather
// than a bare list of urls. `storage_provider` sat on this table unpopulated
// from the day it was created, so deletion fell back to the globally-active
// provider — a fact about today's configuration, not about the file — and a
// change to STORAGE_PROVIDER stranded everything written before it. 30 files
// accumulated that way and had to be removed by a one-off script.
// PROJECT_STATUS §6hh.
//
// ⚠ The fetch seam is deliberate: `deleteStorageObjects` lives in the module
// under test, so the only place to observe the contract is the request it
// makes.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let result = { data: [], error: null };
  const makeBuilder = () => {
    const b = {};
    for (const m of ['select', 'eq', 'in', 'insert', 'delete']) b[m] = vi.fn(() => b);
    b.then = (res, rej) => Promise.resolve(result).then(res, rej);
    return b;
  };
  const supabase = {
    from: vi.fn(() => makeBuilder()),
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'tok' } } })) },
  };
  return { supabase, setResult: (r) => { result = r; } };
});

vi.mock('$lib/supabaseClient', () => ({ supabase: h.supabase }));

const { listAttachments, addAttachments, purgeAttachments, deleteStorageObjects } =
  await import('./mediaAttachments.js');

/** The JSON body of the single fetch call made. */
const sentBody = () => JSON.parse(globalThis.fetch.mock.calls[0][1].body);

beforeEach(() => {
  vi.clearAllMocks();
  h.setResult({ data: [], error: null });
  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok: true, json: () => Promise.resolve({ deleted: 1, failed: 0, results: [] }),
  }));
});

describe('listAttachments', () => {
  it('reads the provider alongside the url — purge routes on it', async () => {
    h.setResult({ data: [{ entity_id: 'i1', storage_url: 'u1', storage_provider: 'google_drive' }], error: null });
    const out = await listAttachments('component_inspection', ['i1', 'i2']);
    const b = h.supabase.from.mock.results[0].value;
    expect(b.select).toHaveBeenCalledWith('entity_id, storage_url, storage_provider');
    expect(b.eq).toHaveBeenCalledWith('entity_type', 'component_inspection');
    expect(b.in).toHaveBeenCalledWith('entity_id', ['i1', 'i2']);
    expect(out[0].storage_provider).toBe('google_drive');
  });

  it('accepts a single id, and short-circuits an empty list', async () => {
    await listAttachments('x', 'one');
    expect(h.supabase.from.mock.results[0].value.in).toHaveBeenCalledWith('entity_id', ['one']);
    h.supabase.from.mockClear();
    expect(await listAttachments('x', [])).toEqual([]);
    expect(h.supabase.from).not.toHaveBeenCalled();
  });

  it('throws on a db error', async () => {
    h.setResult({ data: null, error: { message: 'boom' } });
    await expect(listAttachments('x', ['i1'])).rejects.toThrow('boom');
  });
});

describe('addAttachments records what wrote the file', () => {
  it('takes the provider per item', async () => {
    await addAttachments('component_inspection', 'i1', [
      { url: 'u1', provider: 'google_drive', sizeBytes: 11 },
      { url: 'u2', provider: 'supabase' },
    ], 'user-9');
    const b = h.supabase.from.mock.results[0].value;
    expect(b.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        entity_type: 'component_inspection', entity_id: 'i1', storage_url: 'u1',
        storage_provider: 'google_drive', size_bytes: 11, created_by: 'user-9',
      }),
      expect.objectContaining({ storage_url: 'u2', storage_provider: 'supabase' }),
    ]);
  });

  it('takes one provider for the whole batch, the common case', async () => {
    await addAttachments('x', 'i1', ['u1', 'u2'], 'u', { provider: 'supabase' });
    const rows = h.supabase.from.mock.results[0].value.insert.mock.calls[0][0];
    expect(rows.map(r => r.storage_provider)).toEqual(['supabase', 'supabase']);
  });

  // ⚠ Bare strings still work — some callers genuinely have no provider — but
  // the row must then say so honestly rather than inventing one.
  it('writes null when the caller has no provider, never a guess', async () => {
    await addAttachments('x', 'i1', ['u1'], 'u');
    const rows = h.supabase.from.mock.results[0].value.insert.mock.calls[0][0];
    expect(rows[0].storage_provider).toBeNull();
  });

  it('no-ops for an empty url list', async () => {
    await addAttachments('x', 'i1', [], 'u');
    expect(h.supabase.from).not.toHaveBeenCalled();
  });
});

describe('purgeAttachments hands the provider to the server', () => {
  it('sends url AND provider per file, then removes the rows', async () => {
    h.setResult({
      data: [
        { entity_id: 'i1', storage_url: 'u1', storage_provider: 'google_drive' },
        { entity_id: 'i1', storage_url: 'u2', storage_provider: 'supabase' },
      ],
      error: null,
    });
    await purgeAttachments('component_inspection', ['i1']);

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/media/file');
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer tok');
    // ⛔ The regression this guards: mapping to bare urls here is exactly what
    // made non-Drive files undeletable.
    expect(sentBody().files).toEqual([
      { url: 'u1', provider: 'google_drive' },
      { url: 'u2', provider: 'supabase' },
    ]);
    const deleted = h.supabase.from.mock.results.some(r => r.value.delete.mock.calls.length);
    expect(deleted).toBe(true);
  });

  it('sends a null provider for a legacy row rather than dropping it', async () => {
    h.setResult({ data: [{ entity_id: 'i1', storage_url: 'u1', storage_provider: null }], error: null });
    await purgeAttachments('x', ['i1']);
    expect(sentBody().files).toEqual([{ url: 'u1', provider: null }]);
  });

  it('skips storage cleanup when nothing matches but still issues the delete', async () => {
    h.setResult({ data: [], error: null });
    await purgeAttachments('x', ['i1']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const deleted = h.supabase.from.mock.results.some(r => r.value.delete.mock.calls.length);
    expect(deleted).toBe(true);
  });

  it('no-ops entirely for an empty id list', async () => {
    await purgeAttachments('x', []);
    expect(h.supabase.from).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // ⚠ Storage cleanup is best-effort BY DESIGN — a row pointing at a missing
  // file is recoverable, a file with no row naming it is not. So a network
  // failure must not stop the database delete.
  it('still removes the rows when the storage call fails outright', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network')));
    h.setResult({ data: [{ entity_id: 'i1', storage_url: 'u1', storage_provider: null }], error: null });
    await expect(purgeAttachments('x', ['i1'])).resolves.toBeUndefined();
    const deleted = h.supabase.from.mock.results.some(r => r.value.delete.mock.calls.length);
    expect(deleted).toBe(true);
  });
});

describe('deleteStorageObjects', () => {
  it('reports what happened instead of swallowing it', async () => {
    const out = await deleteStorageObjects([{ storage_url: 'u1', storage_provider: 'supabase' }], 'tok');
    expect(out).toEqual({ deleted: 1, failed: 0, results: [] });
  });

  it('does nothing without a token or without files', async () => {
    expect(await deleteStorageObjects([{ storage_url: 'u1' }], null)).toEqual({ deleted: 0, failed: 0, results: [] });
    expect(await deleteStorageObjects([], 'tok')).toEqual({ deleted: 0, failed: 0, results: [] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('counts a non-ok response as failed rather than silently succeeding', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    const out = await deleteStorageObjects([{ storage_url: 'u1' }], 'tok');
    expect(out.failed).toBe(1);
  });
});
