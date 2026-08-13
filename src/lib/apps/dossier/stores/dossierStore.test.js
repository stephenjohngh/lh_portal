// src/lib/apps/dossier/stores/dossierStore.test.js
// CHARACTERIZATION tests for dossierStore — they pin the store's PUBLIC
// CONTRACT (which DB calls each method makes + the resulting state), not its
// internals. Seams mocked: api, auditLogger, logger.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  // Cast: a hand-rolled mock is not the real api, and without this TS infers
  // never[] from the empty default and then rejects every fixture row.
  const api = /** @type {any} */ ({
    get:    vi.fn(() => Promise.resolve([])),
    create: vi.fn((t, d) => Promise.resolve({ id: 'p-new', ...d })),
    update: vi.fn((t, id, d) => Promise.resolve({ id, ...d })),
    delete: vi.fn(() => Promise.resolve()),
    createMany: vi.fn((t, rows) => Promise.resolve(rows)),
    getAllIn: vi.fn(() => Promise.resolve([])),
  });
  const logAudit = vi.fn();
  const listDocuments = vi.fn(() => Promise.resolve([]));
  return { api, logAudit, listDocuments };
});

vi.mock('$lib/utils/api',         () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',      () => ({ getLogger: () => () => {} }));
// documentApi transitively imports supabaseClient → $env/static/public, which
// does not resolve without the SvelteKit vite plugin.
vi.mock('$lib/utils/documentApi', () => ({ listDocuments: h.listDocuments }));

const { dossierStore: store } = await import('./dossierStore.js');
const { buildSnapshot } = await import('../utils/snapshot.js');

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

describe('loadPackFiles', () => {
  it('loads the shelf scoped to the pack', async () => {
    h.listDocuments.mockResolvedValueOnce([{ id: 'f1', filename: 'notice.pdf' }]);
    await store.loadPackFiles('p1');

    expect(h.listDocuments).toHaveBeenCalledWith({
      entity_type: 'dossier_pack', entity_id: 'p1',
    });
    expect(get(store).files).toHaveLength(1);
  });

  it('is non-fatal — a pack stays editable without its shelf', async () => {
    h.listDocuments.mockRejectedValueOnce(new Error('documents down'));
    await expect(store.loadPackFiles('p1')).resolves.toEqual([]);
    expect(get(store).files).toEqual([]);
  });

  it('clears the shelf when the pack is closed', async () => {
    h.listDocuments.mockResolvedValueOnce([{ id: 'f1' }]);
    await store.loadPackFiles('p1');
    store.closePack();
    expect(get(store).files).toEqual([]);
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

describe('revisions', () => {
  // The store throttles snapshots per doc id in module-level state that
  // outlives a single test, so each test uses its OWN doc id — otherwise a
  // later test inherits an earlier one's "just snapshotted" timestamp and
  // silently skips the snapshot it is trying to assert on.
  let seq = 0;
  const nextDocId = () => `d-${++seq}`;

  /** Seed one doc and leave the mocks ready for a save. */
  async function seedDoc(docId, blocks = { type: 'doc', content: [] }) {
    h.api.get.mockResolvedValueOnce([{ id: docId, title: 'Overview', blocks }]);
    await store.loadDocs(`p-${docId}`);
    h.api.get.mockResolvedValue([]);              // prune query: nothing to trim
  }

  it('snapshots the OUTGOING content on the first save of a doc', async () => {
    const id = nextDocId();
    await seedDoc(id, { type: 'doc', content: ['before'] });
    await store.saveDocBlocks(id, { type: 'doc', content: ['after'] }, 'u1');

    const revision = h.api.create.mock.calls.find(c => c[0] === 'dossier_doc_revisions');
    expect(revision).toBeTruthy();
    // The snapshot holds the PRIOR state — that is what you can return to.
    expect(revision[1]).toMatchObject({
      doc_id: id, title: 'Overview', blocks: { type: 'doc', content: ['before'] },
      created_by: 'u1',
    });
  });

  it('does not snapshot again on a save moments later', async () => {
    const id = nextDocId();
    await seedDoc(id);
    await store.saveDocBlocks(id, { type: 'doc', content: ['a'] }, 'u1');
    const first = h.api.create.mock.calls.filter(c => c[0] === 'dossier_doc_revisions').length;

    await store.saveDocBlocks(id, { type: 'doc', content: ['b'] }, 'u1');
    const second = h.api.create.mock.calls.filter(c => c[0] === 'dossier_doc_revisions').length;

    // Autosave fires constantly; without the interval every keystroke-batch
    // would burn a version slot.
    expect(second).toBe(first);
  });

  it('always snapshots when a summary is given, however recent the last one', async () => {
    const id = nextDocId();
    await seedDoc(id);
    await store.saveDocBlocks(id, { type: 'doc', content: ['a'] }, 'u1');
    const before = h.api.create.mock.calls.filter(c => c[0] === 'dossier_doc_revisions').length;

    await store.saveVersion(id, { type: 'doc', content: ['b'] }, 'u1', 'By hand');
    const calls = h.api.create.mock.calls.filter(c => c[0] === 'dossier_doc_revisions');

    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)[1]).toMatchObject({ summary: 'By hand' });
  });

  it('prunes past the cap, newest kept', async () => {
    const id = nextDocId();
    await seedDoc(id);
    // 22 existing revisions, newest first — the oldest 2 must go.
    const rows = Array.from({ length: 22 }, (_, i) => ({ id: `r${i}` }));
    h.api.get.mockResolvedValueOnce(rows);

    await store.saveDocBlocks(id, { type: 'doc', content: ['x'] }, 'u1');

    const deleted = h.api.delete.mock.calls
      .filter(c => c[0] === 'dossier_doc_revisions').map(c => c[1]);
    expect(deleted).toEqual(['r20', 'r21']);
  });

  it('never fails a save because pruning failed', async () => {
    const id = nextDocId();
    await seedDoc(id);
    h.api.get.mockRejectedValueOnce(new Error('prune boom'));
    await expect(
      store.saveDocBlocks(id, { type: 'doc', content: ['x'] }, 'u1')
    ).resolves.toBeTruthy();
  });

  it('loads revisions newest first', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'r1' }]);
    await store.loadRevisions('d1');
    expect(h.api.get).toHaveBeenCalledWith('dossier_doc_revisions', expect.objectContaining({
      filters: { doc_id: 'd1' }, orderBy: 'created_at', ascending: false,
    }));
  });

  it('restore snapshots the current content first, so it is itself undoable', async () => {
    const id = nextDocId();
    await seedDoc(id, { type: 'doc', content: ['current'] });

    await store.restoreRevision(id,
      { id: 'r1', blocks: { type: 'doc', content: ['old'] }, created_at: '2026-01-01T00:00:00Z' },
      'u1');

    const revisions = h.api.create.mock.calls.filter(c => c[0] === 'dossier_doc_revisions');
    expect(revisions.at(-1)[1].blocks).toEqual({ type: 'doc', content: ['current'] });

    // …and the doc itself is written back to the old content.
    const write = h.api.update.mock.calls.find(c => c[0] === 'dossier_docs');
    expect(write[2].blocks).toEqual({ type: 'doc', content: ['old'] });
  });
});

describe('link reconciliation', () => {
  let seq = 0;
  const nextId = () => `ld-${++seq}`;

  /** A doc whose blocks contain one cross-link. */
  const withLink = (uid, targetId) => ({
    type: 'doc',
    content: [{
      type: 'paragraph', attrs: { uid },
      content: [{
        type: 'text', text: 'see',
        marks: [{ type: 'docLink', attrs: { target_doc_id: targetId, target_slug: 's' } }],
      }],
    }],
  });

  async function seedDoc(id, blocks) {
    h.api.get.mockResolvedValueOnce([{ id, title: 'Page', pack_id: 'p1', blocks }]);
    await store.loadDocs(`p-${id}`);
    h.api.get.mockResolvedValue([]);
  }

  // A save fires TWO reads — the revision prune and the link fetch — so
  // mockResolvedValueOnce is ambiguous about which it answers. Route by table.
  const getByTable = (map) =>
    h.api.get.mockImplementation((table) => Promise.resolve(map[table] ?? []));
  const rejectTable = (table, message) =>
    h.api.get.mockImplementation((t) =>
      t === table ? Promise.reject(new Error(message)) : Promise.resolve([]));

  it('writes a link row when a cross-link appears', async () => {
    const id = nextId();
    await seedDoc(id, { type: 'doc', content: [] });
    h.api.update.mockResolvedValueOnce({ id, pack_id: 'p1', title: 'Page' });

    await store.saveDocBlocks(id, withLink('b1', 'doc-target'), 'u1');

    const [table, rows] = h.api.createMany.mock.calls.at(-1);
    expect(table).toBe('dossier_links');
    expect(rows[0]).toMatchObject({
      pack_id: 'p1', from_doc_id: id, from_block_id: 'b1',
      target_kind: 'doc', target_doc_id: 'doc-target', created_by: 'u1',
    });
  });

  it('writes NOTHING when a save did not change the references', async () => {
    // The property autosave depends on — a prose edit must not touch the graph.
    const id = nextId();
    const blocks = withLink('b1', 'doc-target');
    await seedDoc(id, blocks);
    h.api.update.mockResolvedValue({ id, pack_id: 'p1', title: 'Page' });

    await store.saveDocBlocks(id, blocks, 'u1');   // first save: reconciles
    h.api.createMany.mockClear();
    h.api.delete.mockClear();
    const getCallsBefore = h.api.get.mock.calls.length;

    await store.saveDocBlocks(id, blocks, 'u1');   // second: identical refs

    expect(h.api.createMany).not.toHaveBeenCalled();
    expect(h.api.delete).not.toHaveBeenCalled();
    // …and it did not even query: the signature short-circuits before the fetch.
    const linkFetches = h.api.get.mock.calls
      .slice(getCallsBefore).filter(c => c[0] === 'dossier_links');
    expect(linkFetches).toHaveLength(0);
  });

  it('removes a link row when the author deletes the reference', async () => {
    const id = nextId();
    await seedDoc(id, withLink('b1', 'doc-target'));
    h.api.update.mockResolvedValue({ id, pack_id: 'p1', title: 'Page' });
    // The existing row the reconcile will find.
    getByTable({ dossier_links: [{
      id: 'row-1', from_block_id: 'b1', target_kind: 'doc',
      target_doc_id: 'doc-target', target_document_id: null,
    }] });

    await store.saveDocBlocks(id, { type: 'doc', content: [] }, 'u1');

    expect(h.api.delete).toHaveBeenCalledWith('dossier_links', 'row-1');
  });

  it('never fails a save because the graph could not be reconciled', async () => {
    // dossier_links is derived and rebuildable; content must not be at risk.
    const id = nextId();
    await seedDoc(id, { type: 'doc', content: [] });
    h.api.update.mockResolvedValue({ id, pack_id: 'p1', title: 'Page' });
    rejectTable('dossier_links', 'links table down');

    await expect(
      store.saveDocBlocks(id, withLink('b1', 'doc-target'), 'u1')
    ).resolves.toBeTruthy();
  });

  it('retries after a failure rather than assuming the write landed', async () => {
    const id = nextId();
    await seedDoc(id, { type: 'doc', content: [] });
    h.api.update.mockResolvedValue({ id, pack_id: 'p1', title: 'Page' });
    const blocks = withLink('b1', 'doc-target');

    rejectTable('dossier_links', 'boom');
    await store.saveDocBlocks(id, blocks, 'u1');       // reconcile fails
    expect(h.api.createMany).not.toHaveBeenCalled();

    getByTable({});                                    // links table recovers
    await store.saveDocBlocks(id, blocks, 'u1');       // same refs, must retry

    expect(h.api.createMany).toHaveBeenCalled();
  });
});

describe('loadBacklinks', () => {
  it('queries by target and groups by referring page', async () => {
    h.api.get.mockResolvedValueOnce([
      { from_doc_id: 'd1', from_block_id: 'b1', from_doc: { title: 'Overview', slug: 'overview' } },
      { from_doc_id: 'd1', from_block_id: 'b2', from_doc: { title: 'Overview', slug: 'overview' } },
    ]);
    const result = await store.loadBacklinks('target-doc');

    expect(h.api.get).toHaveBeenCalledWith('dossier_links',
      expect.objectContaining({ filters: { target_doc_id: 'target-doc' } }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ doc_id: 'd1', title: 'Overview' });
  });
});

describe('datasets', () => {
  it('creates a dataset from a template, taking its title from code', () => {
    // The title is not author-supplied: the template owns it, so every pack's
    // chronology is called the same thing.
    return store.createDataset('p1', 'chronology', 'u1').then(() => {
      expect(h.api.create.mock.calls[0][1]).toMatchObject({
        pack_id: 'p1', key: 'chronology', title: 'Chronology', created_by: 'u1',
      });
    });
  });

  it('refuses an unknown template rather than writing a row the DB will reject', async () => {
    // migration 175 has a CHECK constraint; failing here gives a clear message
    // instead of a Postgres violation.
    await expect(store.createDataset('p1', 'invoices', 'u1'))
      .rejects.toThrow(/Unknown dataset type/);
    expect(h.api.create).not.toHaveBeenCalled();
  });

  it('loads EVERY table-s rows with the datasets, not one table at a time', async () => {
    // The broken-reference check has to see rows in tables nobody has opened,
    // and P3's publish walk will need the same.
    h.api.get.mockResolvedValueOnce([{ id: 'ds1', key: 'chronology', title: 'Chronology' }]);
    h.api.getAllIn.mockResolvedValueOnce([{ id: 'r1', dataset_id: 'ds1', position: 0 }]);

    await store.loadDatasets('p1');

    expect(h.api.getAllIn).toHaveBeenCalledWith('dossier_records', 'dataset_id', ['ds1']);
    expect(get(store).records).toHaveLength(1);
  });

  it('coerces a new row against the template, dropping unknown columns', async () => {
    await store.createRecord({ id: 'ds1', key: 'chronology' }, {
      date: '2026-02-14', event: 'Contract signed', rogue: 'nope',
    }, 'u1');

    const row = h.api.create.mock.calls.at(-1)[1];
    expect(row.fields).toEqual({
      date: '2026-02-14', event: 'Contract signed', significance: '',
    });
    expect(row.fields).not.toHaveProperty('rogue');
  });

  it('appends after the highest position IN THAT TABLE', async () => {
    // Records for every table share one list now, so position must be scoped
    // or a new chronology row would land after an unrelated table's rows.
    h.api.get.mockResolvedValueOnce([{ id: 'ds1', key: 'chronology', title: 'Chronology' }]);
    h.api.getAllIn.mockResolvedValueOnce([
      { id: 'r1', dataset_id: 'ds1',   position: 0 },
      { id: 'r2', dataset_id: 'ds1',   position: 4 },
      { id: 'r9', dataset_id: 'other', position: 99 },
    ]);
    await store.loadDatasets('p1');

    await store.createRecord({ id: 'ds1', key: 'chronology' }, { event: 'x' }, 'u1');
    expect(h.api.create.mock.calls.at(-1)[1].position).toBe(5);
  });

  it('adds pasted rows in ONE insert, numbered in the order given', async () => {
    // A pasted thread is up to a dozen messages. One insert per row would be a
    // dozen round trips and a dozen chances to half-finish.
    h.api.get.mockResolvedValueOnce([{ id: 'ds1', key: 'correspondence', title: 'Correspondence' }]);
    h.api.getAllIn.mockResolvedValueOnce([{ id: 'r1', dataset_id: 'ds1', position: 2 }]);
    await store.loadDatasets('p1');

    await store.createRecords({ id: 'ds1', key: 'correspondence', title: 'Correspondence' }, [
      { fields: { date: '2025-01-13', from: 'Jane', subject: 'One', rogue: 'nope' } },
      { fields: { date: '2025-01-14', from: 'Steve', subject: 'Two' } },
    ], 'u1');

    expect(h.api.createMany).toHaveBeenCalledTimes(1);
    const [table, rows] = h.api.createMany.mock.calls.at(-1);
    expect(table).toBe('dossier_records');
    // Positions continue the table, in order, so same-day messages keep their
    // sequence when the date sort cannot separate them.
    expect(rows.map(r => r.position)).toEqual([3, 4]);
    expect(rows[0].fields).not.toHaveProperty('rogue');
    expect(rows[0].fields.summary).toBe('');   // every template column present
    expect(get(store).records).toHaveLength(3);
  });

  it('carries a row-s file link, so an index entry opens what it describes', async () => {
    await store.createRecords({ id: 'ds1', key: 'document_index' },
      [{ fields: { name: 'Notice' }, document_id: 'f1' }], 'u1');

    const [row] = h.api.createMany.mock.calls.at(-1)[1];
    expect(row.document_id).toBe('f1');
    expect(row.doc_id).toBeNull();
  });

  it('writes nothing when there are no rows to add', async () => {
    h.api.createMany.mockClear();
    await expect(store.createRecords({ id: 'ds1', key: 'correspondence' }, [], 'u1'))
      .resolves.toEqual([]);
    expect(h.api.createMany).not.toHaveBeenCalled();
  });

  it('rejects a bad date on update instead of storing it', async () => {
    await store.updateRecord({ id: 'ds1', key: 'chronology' }, 'r1',
      { fields: { date: '14/02/2026', event: 'x' } }, 'u1');
    expect(h.api.update.mock.calls.at(-1)[2].fields.date).toBe('');
  });

  it('clears the open table when its dataset is deleted', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'ds1', key: 'chronology', title: 'Chronology' }]);
    h.api.getAllIn.mockResolvedValueOnce([
      { id: 'r1', dataset_id: 'ds1' }, { id: 'r2', dataset_id: 'other' },
    ]);
    await store.loadDatasets('p1');

    await store.deleteDataset('ds1', 'Chronology');

    expect(get(store).datasets).toEqual([]);
    // Only that table's rows go; another table's are untouched.
    expect(get(store).records.map(r => r.id)).toEqual(['r2']);
  });
});

describe('publications', () => {
  const pack = { id: 'p1', title: 'Flat 4 dispute', description: '' };

  /** The snapshot a caller would have built and shown in the review. */
  function reviewed() {
    const state = get(store);
    return buildSnapshot({
      pack, docs: state.docs, datasets: state.datasets,
      records: state.records, files: state.files,
    });
  }

  /** Load a pack with one page, one file on the shelf, and the page using it. */
  async function seedPack() {
    h.api.get.mockResolvedValueOnce([{
      id: 'd1', slug: 'overview', title: 'Overview', order_index: 0,
      blocks: {
        type: 'doc',
        content: [{ type: 'asset', attrs: { uid: 'b1', document_id: 'f1' } }],
      },
    }]);
    await store.loadDocs('p1');

    h.listDocuments.mockResolvedValueOnce([
      { id: 'f1', filename: 'notice.pdf', display_name: 'Notice',
        provider_file_id: 'drive-1', mime_type: 'application/pdf', file_size: 10 },
      { id: 'f9', filename: 'private.pdf', display_name: 'Unreferenced',
        provider_file_id: 'drive-9', mime_type: 'application/pdf', file_size: 20 },
    ]);
    await store.loadPackFiles('p1');
  }

  it('stores only the token HASH, and returns the token exactly once', async () => {
    await seedPack();
    const { token } = await store.createPublication({ pack, snapshot: reviewed() }, 'u1');

    const row = h.api.create.mock.calls.at(-1)[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The row must not carry the token in any form.
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_prefix).toBe(token.slice(0, 8));
  });

  it('freezes what is loaded, so the author publishes what they reviewed', async () => {
    await seedPack();
    await store.createPublication({ pack, snapshot: reviewed() }, 'u1');

    const row = h.api.create.mock.calls.at(-1)[1];
    expect(row.snapshot.docs.map(d => d.id)).toEqual(['d1']);
    expect(row.snapshot.docs[0].blocks).toBeTruthy();
  });

  it('manifests ONLY referenced files — the rest of the shelf stays out of reach', async () => {
    await seedPack();
    await store.createPublication({ pack, snapshot: reviewed() }, 'u1');

    const { manifest } = h.api.create.mock.calls.at(-1)[1];
    expect(manifest.files.map(f => f.document_id)).toEqual(['f1']);
  });

  it('carries the checksums measured at publish time', async () => {
    await seedPack();
    await store.createPublication({
      pack, snapshot: reviewed(),
      checksums: { f1: { checksum: 'abc', pinned_file_id: 'pin-1' } },
    }, 'u1');

    const { manifest } = h.api.create.mock.calls.at(-1)[1];
    expect(manifest.files[0].checksum).toBe('abc');
    expect(manifest.files[0].pinned_file_id).toBe('pin-1');
  });

  it('stores no snapshot in follow-latest mode', async () => {
    // Freezing a copy would be a lie about what the recipient is seeing.
    await seedPack();
    await store.createPublication({ pack, snapshot: reviewed(), mode: 'latest' }, 'u1');

    const row = h.api.create.mock.calls.at(-1)[1];
    expect(row.mode).toBe('latest');
    expect(row.snapshot).toBeNull();
    expect(row.manifest.files).toHaveLength(1);   // assets still need serving
  });

  it('reads the next version from the DATABASE, not from what is loaded', async () => {
    // The Links sidebar is collapsed by default, so state.publications is
    // usually empty. Deriving the version from it meant the SECOND publish of
    // any pack computed version 1 again and died on the unique constraint —
    // after the files had already been read and pinned.
    await seedPack();
    h.api.get.mockResolvedValueOnce([{ version: 4 }]);   // the query for max version

    await store.createPublication({ pack, snapshot: reviewed() }, 'u1');

    expect(h.api.get).toHaveBeenCalledWith('dossier_publications', {
      select: 'version', filters: { pack_id: 'p1' },
      orderBy: 'version', ascending: false, limit: 1,
    });
    expect(h.api.create.mock.calls.at(-1)[1].version).toBe(5);
  });

  it('starts at 1 for a pack that has never been published', async () => {
    await seedPack();
    h.api.get.mockResolvedValueOnce([]);
    await store.createPublication({ pack, snapshot: reviewed() }, 'u1');
    expect(h.api.create.mock.calls.at(-1)[1].version).toBe(1);
  });

  it('retries once when two tabs race for the same version', async () => {
    // The unique constraint is the real guard; an author whose files are
    // already pinned should not meet a Postgres error because of it.
    await seedPack();
    h.api.get.mockResolvedValueOnce([{ version: 1 }]);
    h.api.create.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key value violates unique constraint'),
        { code: '23505' }));
    h.api.get.mockResolvedValueOnce([{ version: 2 }]);

    await store.createPublication({ pack, snapshot: reviewed() }, 'u1');

    expect(h.api.create).toHaveBeenCalledTimes(2);
    expect(h.api.create.mock.calls.at(-1)[1].version).toBe(3);
  });

  it('does not swallow an unrelated insert failure', async () => {
    await seedPack();
    h.api.get.mockResolvedValueOnce([]);
    h.api.create.mockRejectedValueOnce(new Error('network down'));

    await expect(store.createPublication({ pack, snapshot: reviewed() }, 'u1')).rejects.toThrow('network down');
    expect(h.api.create).toHaveBeenCalledTimes(1);
  });

  it('audits the issue at warning severity, recording what was exposed', async () => {
    // Long after the pack has moved on, the audit trail must still answer
    // "what did that link give them?".
    //
    // The store is a module singleton, so earlier tests in this block have left
    // publications in state and the version would otherwise be whatever they
    // added up to. Reset it, so the number asserted below means something.
    h.api.get.mockResolvedValueOnce([]);
    await store.loadPublications('p1');
    await seedPack();
    await store.createPublication(
      { pack, snapshot: reviewed(), recipientLabel: 'Smith & Co' }, 'u1');

    const [, , , , meta] = h.logAudit.mock.calls.at(-1);
    expect(meta.severity).toBe('warning');
    expect(meta.afterData).toMatchObject({
      pack_id: 'p1', version: 1, file_count: 1, recipient_label: 'Smith & Co',
    });
  });

  it('revokes without deleting — the record that a link was issued survives', async () => {
    h.api.update.mockResolvedValueOnce({ id: 'pub1', title: 'P', revoked_at: 'now' });
    await store.revokePublication('pub1', 'u2');

    expect(h.api.delete).not.toHaveBeenCalled();
    expect(h.api.update.mock.calls.at(-1)[2]).toMatchObject({ revoked_by: 'u2' });
    expect(h.api.update.mock.calls.at(-1)[2].revoked_at).toBeTruthy();
  });

  it('regenerating replaces the token and leaves the snapshot alone', async () => {
    // The recipient who gets the new link must see exactly what the old one
    // showed — only the secret changes.
    h.api.update.mockResolvedValueOnce({ id: 'pub1', title: 'P', token_prefix: 'xxxxxxxx' });
    const { token } = await store.regeneratePublicationToken('pub1', 'u1');

    const patch = h.api.update.mock.calls.at(-1)[2];
    expect(patch.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(patch).not.toHaveProperty('snapshot');
    expect(patch).not.toHaveProperty('manifest');
    expect(JSON.stringify(patch)).not.toContain(token);
  });

  it('clears publications when the pack is closed', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'pub1', version: 1 }]);
    await store.loadPublications('p1');
    expect(get(store).publications).toHaveLength(1);

    store.closePack();
    expect(get(store).publications).toEqual([]);
  });
});

describe('store contract', () => {
  it('exposes only subscribe + named methods (never set/update)', () => {
    expect(store.set).toBeUndefined();
    expect(store.update).toBeUndefined();
    expect(typeof store.subscribe).toBe('function');
  });
});
