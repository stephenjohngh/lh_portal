// src/lib/apps/compliance/stores/displayRegisterStore.test.js
//
// CHARACTERIZATION tests for displayRegisterStore (Admin > Display Register,
// BSA s.82). Pins the parts that carry real rules rather than plumbing:
// the row shape toRow builds, the not_set -> displayed escalation, the
// singleton-slot delete guard, and what setStatus stamps.
//
// Seams mocked: api, supabaseClient (auth.getUser), auditLogger, logger.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  const api = {
    get:    vi.fn(() => Promise.resolve([])),
    create: vi.fn((t, d) => Promise.resolve({ id: 'new-1', ...d })),
    update: vi.fn((t, id, d) => Promise.resolve({ id, ...d })),
    delete: vi.fn(() => Promise.resolve()),
  };
  const supabase = { auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) } };
  return { api, supabase, logAudit: vi.fn() };
});

vi.mock('$lib/utils/api',         () => ({ api: h.api }));
vi.mock('$lib/supabaseClient',    () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',      () => ({ getLogger: () => () => {} }));

const { displayRegisterStore: store, SINGLETON_CATEGORIES } =
  await import('./displayRegisterStore.js');

const form = (over = {}) => ({ title: 'AP notice', display_location: 'Lobby', ...over });

beforeEach(() => { vi.clearAllMocks(); h.api.get.mockResolvedValue([]); });

describe('load', () => {
  it('reads display_items and sorts by location then title', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: '2', title: 'BAC',       display_location: 'Lobby' },
      { id: '1', title: 'AP notice', display_location: 'Lobby' },
      { id: '3', title: 'Notice',    display_location: 'Bin store' },
    ]);
    await store.load();
    expect(h.api.get).toHaveBeenCalledWith('display_items', { orderBy: 'display_location' });
    expect(get(store).items.map(i => i.id)).toEqual(['3', '1', '2']);
    expect(get(store).loading).toBe(false);
  });

  it('records the error and rethrows', async () => {
    h.api.get.mockRejectedValueOnce(new Error('nope'));
    await expect(store.load()).rejects.toThrow('nope');
    expect(get(store).error).toBe('nope');
  });
});

describe('create — row shape', () => {
  it('trims text, nulls blanks, and stamps both actor columns', async () => {
    await store.create(form({
      title: '  AP notice  ',
      display_location: '  Lobby  ',
      current_version: '',
      accessible_format: '  Large print  ',
      inspection_frequency_days: '30',
    }));
    const row = h.api.create.mock.calls[0][1];
    expect(h.api.create.mock.calls[0][0]).toBe('display_items');
    expect(row).toMatchObject({
      title: 'AP notice',
      display_location: 'Lobby',
      current_version: null,             // blank is "not recorded", not ''
      accessible_format: 'Large print',
      inspection_frequency_days: 30,     // string coerced
      created_by: 'u1',
      updated_by: 'u1',
    });
  });

  it('nulls an empty location rather than storing an empty string', async () => {
    await store.create(form({ display_location: '   ' }));
    expect(h.api.create.mock.calls[0][1].display_location).toBeNull();
  });

  it('audits the creation', async () => {
    h.api.create.mockResolvedValueOnce({ id: 'd9', title: 'BAC', category: 'bac' });
    await store.create(form({ title: 'BAC', category: 'bac' }));
    expect(h.logAudit).toHaveBeenCalledWith(
      'create', 'display_item', 'd9', 'BAC', expect.objectContaining({ appId: 'admin' }));
  });
});

// The seeded s.82 slots start as `not_set`; filling one in IS the act of
// putting it on display, so it must not stay flagged as missing.
describe('save — not_set escalation', () => {
  it('promotes a not_set slot to displayed when real content is saved', async () => {
    await store.save('ap-1', form({ previousStatus: 'not_set' }));
    expect(h.api.update.mock.calls[0][2].status).toBe('displayed');
  });

  it('leaves the status alone for an item that was already displayed', async () => {
    await store.save('ap-1', form({ previousStatus: 'displayed' }));
    expect(h.api.update.mock.calls[0][2]).not.toHaveProperty('status');
  });

  it('never sends created_by on an update', async () => {
    await store.save('ap-1', form());
    expect(h.api.update.mock.calls[0][2]).not.toHaveProperty('created_by');
    expect(h.api.update.mock.calls[0][2].updated_by).toBe('u1');
  });
});

describe('setStatus', () => {
  it('stamps a refresh when marking something displayed again', async () => {
    await store.setStatus('d1', 'displayed');
    const patch = h.api.update.mock.calls[0][2];
    expect(patch.status).toBe('displayed');
    expect(patch.last_refreshed_at).toEqual(expect.any(String));
    expect(patch.refreshed_by).toBe('u1');
  });

  // A fault is not a refresh: recording damage must not look like someone
  // went and checked the notice was fine.
  it('does NOT stamp a refresh when reporting a fault, and keeps the note', async () => {
    await store.setStatus('d1', 'damaged', { notes: 'Glass broken' });
    const patch = h.api.update.mock.calls[0][2];
    expect(patch.status).toBe('damaged');
    expect(patch.status_notes).toBe('Glass broken');
    expect(patch).not.toHaveProperty('last_refreshed_at');
    expect(patch.status_since).toEqual(expect.any(String));
  });

  it('audits a fault more loudly than a refresh', async () => {
    h.api.update.mockResolvedValueOnce({ id: 'd1', title: 'AP notice' });
    await store.setStatus('d1', 'removed');
    expect(h.logAudit).toHaveBeenCalledWith(
      'update', 'display_item', 'd1', 'AP notice',
      expect.objectContaining({ severity: 'warning' }));
  });
});

// s.82 names these two, so their absence has to stay visible. Deleting the
// slot would hide a compliance gap rather than record one.
describe('remove — singleton guard', () => {
  const seed = async (category) => {
    h.api.get.mockResolvedValueOnce([{ id: 'x1', title: 'T', category, display_location: 'L' }]);
    await store.load();
  };

  it('refuses to delete the AP notice slot', async () => {
    await seed('ap_notice');
    await expect(store.remove('x1')).rejects.toThrow(/AP notice/i);
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete the BAC slot', async () => {
    await seed('bac');
    await expect(store.remove('x1')).rejects.toThrow(/BAC/i);
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it('allows deleting a compliance notice, which is genuinely zero-or-many', async () => {
    await seed('compliance_notice');
    await store.remove('x1');
    expect(h.api.delete).toHaveBeenCalledWith('display_items', 'x1');
    expect(get(store).items).toHaveLength(0);
  });

  it('guards exactly the two statutory singletons', () => {
    expect([...SINGLETON_CATEGORIES].sort()).toEqual(['ap_notice', 'bac']);
  });
});
