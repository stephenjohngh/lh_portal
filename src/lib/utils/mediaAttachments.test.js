// src/lib/utils/mediaAttachments.test.js
// Shared access to the polymorphic media_attachments table. Seams mocked:
// supabaseClient (from()-builder + auth) and driveUtils (deleteStorageFiles).
// Pins: the read shape, the insert rows, and that purge cleans up storage files
// before removing rows (and no-ops / skips correctly at the edges).

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
  return {
    supabase,
    deleteStorageFiles: vi.fn(() => Promise.resolve()),
    setResult: (r) => { result = r; },
  };
});

vi.mock('$lib/supabaseClient',       () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/driveUtils.js',  () => ({ deleteStorageFiles: h.deleteStorageFiles }));

const { listAttachments, addAttachments, purgeAttachments } = await import('./mediaAttachments.js');

beforeEach(() => { vi.clearAllMocks(); h.setResult({ data: [], error: null }); });

describe('listAttachments', () => {
  it('reads entity_id + storage_url scoped to the entity type and ids', async () => {
    h.setResult({ data: [{ entity_id: 'i1', storage_url: 'u1' }], error: null });
    const out = await listAttachments('component_inspection', ['i1', 'i2']);
    expect(h.supabase.from).toHaveBeenCalledWith('media_attachments');
    const b = h.supabase.from.mock.results[0].value;
    expect(b.select).toHaveBeenCalledWith('entity_id, storage_url');
    expect(b.eq).toHaveBeenCalledWith('entity_type', 'component_inspection');
    expect(b.in).toHaveBeenCalledWith('entity_id', ['i1', 'i2']);
    expect(out).toEqual([{ entity_id: 'i1', storage_url: 'u1' }]);
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

describe('addAttachments', () => {
  it('inserts one row per url with the owning keys + creator', async () => {
    await addAttachments('component_inspection', 'i1', ['u1', 'u2'], 'user-9');
    const b = h.supabase.from.mock.results[0].value;
    expect(b.insert).toHaveBeenCalledWith([
      expect.objectContaining({ entity_type: 'component_inspection', entity_id: 'i1', storage_url: 'u1', mime_type: 'image/jpeg', created_by: 'user-9' }),
      expect.objectContaining({ storage_url: 'u2' }),
    ]);
  });

  it('no-ops for an empty url list', async () => {
    await addAttachments('x', 'i1', [], 'u');
    expect(h.supabase.from).not.toHaveBeenCalled();
  });
});

describe('purgeAttachments', () => {
  it('deletes the storage files (with the session token) then removes the rows', async () => {
    h.setResult({ data: [{ entity_id: 'i1', storage_url: 'u1' }], error: null });
    await purgeAttachments('component_inspection', ['i1']);
    expect(h.deleteStorageFiles).toHaveBeenCalledWith(['u1'], 'tok');
    const deleted = h.supabase.from.mock.results.some(r => r.value.delete.mock.calls.length);
    expect(deleted).toBe(true);
  });

  it('skips storage cleanup when nothing matches but still issues the delete', async () => {
    h.setResult({ data: [], error: null });
    await purgeAttachments('x', ['i1']);
    expect(h.deleteStorageFiles).not.toHaveBeenCalled();
    const deleted = h.supabase.from.mock.results.some(r => r.value.delete.mock.calls.length);
    expect(deleted).toBe(true);
  });

  it('no-ops entirely for an empty id list', async () => {
    await purgeAttachments('x', []);
    expect(h.supabase.from).not.toHaveBeenCalled();
    expect(h.deleteStorageFiles).not.toHaveBeenCalled();
  });
});
