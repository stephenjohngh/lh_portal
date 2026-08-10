// src/lib/apps/dossier/stores/dossierStore.test.js
// CHARACTERIZATION tests for dossierStore — they pin the store's PUBLIC
// CONTRACT (which DB calls each method makes + the resulting state), not its
// internals. Seams mocked: api, auditLogger, logger.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  const api = {
    get:    vi.fn(() => Promise.resolve([])),
    create: vi.fn((t, d) => Promise.resolve({ id: 'p-new', ...d })),
    update: vi.fn((t, id, d) => Promise.resolve({ id, ...d })),
    delete: vi.fn(() => Promise.resolve()),
  };
  const logAudit = vi.fn();
  return { api, logAudit };
});

vi.mock('$lib/utils/api',         () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',      () => ({ getLogger: () => () => {} }));

const { dossierStore: store } = await import('./dossierStore.js');

beforeEach(() => { vi.clearAllMocks(); h.api.get.mockResolvedValue([]); });

/** Seed the store with packs via loadPacks. */
async function seed(packs) {
  h.api.get.mockResolvedValueOnce(packs);
  await store.loadPacks();
}

describe('loadPacks', () => {
  it('loads packs and clears loading', async () => {
    await seed([{ id: 'p1', title: 'Dispute', created_at: '2026-01-01T00:00:00Z' }]);
    expect(get(store).packs).toHaveLength(1);
    expect(get(store).loading).toBe(false);
    expect(h.api.get).toHaveBeenCalledWith('dossier_packs',
      { orderBy: 'created_at', ascending: false });
  });

  it('sorts most-recently-touched first, falling back to created_at', async () => {
    await seed([
      { id: 'old',     title: 'Old',     created_at: '2026-01-01T00:00:00Z' },
      { id: 'touched', title: 'Touched', created_at: '2025-01-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z' },
    ]);
    // `touched` was created first but edited later, so it sorts above `old`.
    expect(get(store).packs.map(p => p.id)).toEqual(['touched', 'old']);
  });

  it('records the error and rethrows on failure', async () => {
    h.api.get.mockRejectedValueOnce(new Error('boom'));
    await expect(store.loadPacks()).rejects.toThrow('boom');
    expect(get(store).error).toBe('boom');
    expect(get(store).loading).toBe(false);
  });
});

describe('createPack', () => {
  it('stamps created_by — the RLS insert policy rejects the row without it', async () => {
    await store.createPack({ title: 'Dispute' }, 'u1');
    const [table, row] = h.api.create.mock.calls[0];
    expect(table).toBe('dossier_packs');
    expect(row).toMatchObject({
      title: 'Dispute', description: null, status: 'active',
      created_by: 'u1', updated_by: 'u1',
    });
    expect(row.updated_at).toBeTruthy();
  });

  it('prepends the new pack and audits the creation', async () => {
    await seed([{ id: 'p1', title: 'Existing', created_at: '2020-01-01T00:00:00Z' }]);
    h.api.create.mockResolvedValueOnce({
      id: 'p2', title: 'New', created_at: '2026-08-01T00:00:00Z',
    });
    await store.createPack({ title: 'New' }, 'u1');

    expect(get(store).packs.map(p => p.id)).toEqual(['p2', 'p1']);
    expect(h.logAudit).toHaveBeenCalledWith(
      'create', 'dossier_pack', 'p2', 'New', expect.objectContaining({ appId: 'dossier' }));
  });
});

describe('updatePack', () => {
  it('writes the edited fields, stamps the user, and replaces the row in state', async () => {
    await seed([{ id: 'p1', title: 'Before', created_at: '2026-01-01T00:00:00Z' }]);
    h.api.update.mockResolvedValueOnce({
      id: 'p1', title: 'After', created_at: '2026-01-01T00:00:00Z',
    });
    await store.updatePack('p1', { title: 'After', description: 'why' }, 'u2');

    const [, id, patch] = h.api.update.mock.calls[0];
    expect(id).toBe('p1');
    expect(patch).toMatchObject({ title: 'After', description: 'why', updated_by: 'u2' });
    expect(get(store).packs[0].title).toBe('After');
  });
});

describe('setArchived', () => {
  it('archives and restores via the status column', async () => {
    await seed([{ id: 'p1', title: 'P', status: 'active', created_at: '2026-01-01T00:00:00Z' }]);

    h.api.update.mockResolvedValueOnce({ id: 'p1', title: 'P', status: 'archived' });
    await store.setArchived('p1', true, 'u1');
    expect(h.api.update.mock.calls[0][2]).toMatchObject({ status: 'archived' });
    expect(get(store).packs[0].status).toBe('archived');

    h.api.update.mockResolvedValueOnce({ id: 'p1', title: 'P', status: 'active' });
    await store.setArchived('p1', false, 'u1');
    expect(h.api.update.mock.calls[1][2]).toMatchObject({ status: 'active' });
    expect(get(store).packs[0].status).toBe('active');
  });
});

describe('deletePack', () => {
  it('removes the pack from state and audits at warning severity', async () => {
    await seed([
      { id: 'p1', title: 'Gone', created_at: '2026-01-01T00:00:00Z' },
      { id: 'p2', title: 'Kept', created_at: '2026-01-02T00:00:00Z' },
    ]);
    await store.deletePack('p1', 'Gone');

    expect(h.api.delete).toHaveBeenCalledWith('dossier_packs', 'p1');
    expect(get(store).packs.map(p => p.id)).toEqual(['p2']);
    expect(h.logAudit).toHaveBeenCalledWith(
      'delete', 'dossier_pack', 'p1', 'Gone',
      expect.objectContaining({ severity: 'warning' }));
  });
});

describe('loadDocs / closePack', () => {
  it('loads a pack-s docs in order_index order and records the active pack', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'd1', title: 'Overview' }]);
    await store.loadDocs('p1');

    expect(h.api.get).toHaveBeenCalledWith('dossier_docs', {
      filters: { pack_id: 'p1' }, orderBy: 'order_index', ascending: true,
    });
    expect(get(store).docs).toHaveLength(1);
    expect(get(store).activePackId).toBe('p1');
    expect(get(store).loadingDocs).toBe(false);
  });

  it('clears the docs when the pack is closed', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'd1', title: 'Overview' }]);
    await store.loadDocs('p1');
    store.closePack();
    expect(get(store).docs).toEqual([]);
    expect(get(store).activePackId).toBeNull();
  });
});

describe('createDoc', () => {
  it('derives a unique slug from the titles already in the pack', async () => {
    const existing = [{ id: 'd1', slug: 'chronology', parent_doc_id: null, order_index: 0 }];
    await store.createDoc({ packId: 'p1', title: 'Chronology' }, 'u1', existing);
    expect(h.api.create.mock.calls[0][1]).toMatchObject({
      pack_id: 'p1', parent_doc_id: null, title: 'Chronology',
      slug: 'chronology-2',      // 'chronology' was taken
      order_index: 1,            // appended after the existing sibling
      created_by: 'u1',
    });
  });

  it('nests under a parent and starts that branch-s ordering at 0', async () => {
    const existing = [{ id: 'p', slug: 'parent', parent_doc_id: null, order_index: 0 }];
    await store.createDoc({ packId: 'p1', parentId: 'p', title: 'Child' }, 'u1', existing);
    expect(h.api.create.mock.calls[0][1]).toMatchObject({
      parent_doc_id: 'p', order_index: 0,
    });
  });
});

describe('renameDoc', () => {
  it('changes the title but never the slug — shared links must keep working', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'd1', title: 'Before', slug: 'before' }]);
    await store.loadDocs('p1');
    h.api.update.mockResolvedValueOnce({ id: 'd1', title: 'After', slug: 'before' });

    await store.renameDoc('d1', 'After', 'u1');

    const patch = h.api.update.mock.calls[0][2];
    expect(patch).toMatchObject({ title: 'After' });
    expect(patch).not.toHaveProperty('slug');
    expect(get(store).docs[0]).toMatchObject({ title: 'After', slug: 'before' });
  });
});

describe('deleteDoc', () => {
  it('drops the doc and its subtree from state (the DB cascades)', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' },
    ]);
    await store.loadDocs('p1');

    await store.deleteDoc('a', 'A', ['b']);      // 'b' is a's child

    expect(h.api.delete).toHaveBeenCalledWith('dossier_docs', 'a');
    expect(get(store).docs.map(d => d.id)).toEqual(['c']);
  });
});

describe('applyMove', () => {
  it('persists every patch and mirrors them into state', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: 'a', parent_doc_id: null, order_index: 0 },
      { id: 'b', parent_doc_id: null, order_index: 1 },
    ]);
    await store.loadDocs('p1');

    await store.applyMove({ ok: true, patches: [
      { id: 'b', parent_doc_id: 'a', order_index: 0 },
      { id: 'a', order_index: 0 },
    ] }, 'u1');

    expect(h.api.update).toHaveBeenCalledTimes(2);
    const docs = Object.fromEntries(get(store).docs.map(d => [d.id, d]));
    expect(docs.b).toMatchObject({ parent_doc_id: 'a', order_index: 0 });
  });

  it('is a no-op for a refused plan — the guards cannot be bypassed', async () => {
    await store.applyMove({ ok: false, reason: 'cycle' }, 'u1');
    await store.applyMove({ ok: true, patches: [] }, 'u1');
    expect(h.api.update).not.toHaveBeenCalled();
  });
});

describe('store contract', () => {
  it('exposes only subscribe + named methods (never set/update)', () => {
    expect(store.set).toBeUndefined();
    expect(store.update).toBeUndefined();
    expect(typeof store.subscribe).toBe('function');
  });
});
