// src/lib/apps/info/stores/infoStore.test.js
// CHARACTERIZATION tests for infoStore. Notes sort pinned-first then by
// updated_at desc; sections sort by display_order; documents go through the
// /api/documents/* endpoints (fetch), never direct storage. Seams mocked: api,
// supabaseClient (auth.getSession for bearer headers), auditLogger, logger, fetch.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  const api = {
    get:     vi.fn(() => Promise.resolve([])),
    getById: vi.fn(() => Promise.resolve({ id: 'n1', title: 'Note' })),
    create:  vi.fn((t, d) => Promise.resolve({ id: `${t}-1`, ...d })),
    update:  vi.fn((t, id, d) => Promise.resolve({ id, ...d })),
    delete:  vi.fn(() => Promise.resolve()),
  };
  api.getAll = api.get;   // the real getAll pages; here it answers as get does
  const supabase = { auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'tok' } } })) } };
  return { api, supabase, logAudit: vi.fn() };
});

vi.mock('#lib/utils/api.js',         () => ({ api: h.api }));
vi.mock('#lib/supabaseClient.js',    () => ({ supabase: h.supabase }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: h.logAudit }));
vi.mock('#lib/utils/logger.js',      () => ({ getLogger: () => () => {} }));

const { infoStore } = await import('./infoStore.js');

// fetch helper: returns ok JSON unless overridden.
function mockFetch(body, ok = true) {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.api.get.mockResolvedValue([]);
  mockFetch([]);
});

describe('loadNotes — sort order', () => {
  it('puts pinned notes first, then orders by updated_at desc', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: 'a', is_pinned: false, updated_at: '2026-01-01' },
      { id: 'b', is_pinned: true,  updated_at: '2026-01-01' },
      { id: 'c', is_pinned: false, updated_at: '2026-03-01' },
    ]);
    await infoStore.loadNotes();
    expect(get(infoStore).notes.map(n => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('passes a section filter when given', async () => {
    await infoStore.loadNotes('sec1');
    expect(h.api.get).toHaveBeenCalledWith('info_notes', expect.objectContaining({ filters: { section_id: 'sec1' } }));
  });
});

describe('sections', () => {
  it('createSection inserts then sorts by display_order', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 's1', name: 'B', display_order: 5 }]);
    await infoStore.loadSections();
    h.api.create.mockResolvedValueOnce({ id: 's2', name: 'A', display_order: 1 });
    await infoStore.createSection({ name: 'A', display_order: 1 }, 'u1');
    expect(get(infoStore).sections.map(s => s.id)).toEqual(['s2', 's1']);
    expect(h.logAudit).toHaveBeenCalledWith('create', 'info_section', 's2', 'A', expect.any(Object));
  });

  it('deleteSection removes it from state', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 's1', name: 'X', display_order: 1 }]);
    await infoStore.loadSections();
    await infoStore.deleteSection('s1', 'X');
    expect(get(infoStore).sections).toHaveLength(0);
  });

  it("deleteSection deletes each note's documents first, then the notes, then the section", async () => {
    // The notes go by FK cascade anyway; their documents would not — the
    // library has no FK — so they were left in Drive (2026-09-27).
    h.api.get.mockResolvedValueOnce([{ id: 'n1', title: 'A' }, { id: 'n2', title: 'B' }]);
    const calls = [];
    globalThis.fetch = vi.fn((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url).replace(/^\/api\/documents/, '')}`);
      const body = String(url).includes('entity_id=n1') ? [{ id: 'd1' }] : [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });
    h.api.delete.mockImplementation((t, id) => { calls.push(`row ${t}:${id}`); return Promise.resolve(); });

    await infoStore.deleteSection('s1', 'X');

    expect(h.api.get).toHaveBeenCalledWith('info_notes', expect.objectContaining({ filters: { section_id: 's1' } }));
    expect(calls).toEqual([
      'GET ?entity_type=info_note&entity_id=n1',
      'DELETE /d1',
      'row info_notes:n1',
      'GET ?entity_type=info_note&entity_id=n2',
      'row info_notes:n2',
      'row info_sections:s1',
    ]);
  });
});

describe('notes mutations', () => {
  it('createNote defaults status active + empty tags and audits (without touching the list)', async () => {
    await infoStore.createNote({ title: 'New', section_id: 'sec1' }, 'u1');
    const arg = h.api.create.mock.calls[0][1];
    expect(arg).toMatchObject({ status: 'active', tags: [], is_pinned: false, created_by: 'u1' });
    expect(h.logAudit).toHaveBeenCalledWith('create', 'info_note', expect.any(String), 'New', expect.any(Object));
  });

  it('updateNote patches the in-list note and re-sorts', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'n1', title: 'old', is_pinned: false, updated_at: '2026-01-01' }]);
    await infoStore.loadNotes();
    await infoStore.updateNote('n1', { title: 'new' }, 'u1');
    expect(get(infoStore).notes.find(n => n.id === 'n1').title).toBe('new');
  });

  it('deleteNote removes it and clears selectedNote when it matches', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'n1', title: 'X', is_pinned: false, updated_at: '2026-01-01' }]);
    await infoStore.loadNotes();
    await infoStore.deleteNote('n1', 'X');
    expect(get(infoStore).notes).toHaveLength(0);
  });

  it('deleteNote KEEPS the note when one of its documents cannot be deleted', async () => {
    // It used to delete the note regardless, leaving the file in Drive with
    // nothing pointing at it (2026-09-27).
    h.api.get.mockResolvedValueOnce([{ id: 'n1', title: 'X', is_pinned: false, updated_at: '2026-01-01' }]);
    await infoStore.loadNotes();
    globalThis.fetch = vi.fn((url, init) => Promise.resolve(init?.method === 'DELETE'
      ? { ok: false, json: () => Promise.resolve({ error: 'drive busy' }) }
      : { ok: true,  json: () => Promise.resolve([{ id: 'd1' }]) }));
    await expect(infoStore.deleteNote('n1', 'X')).rejects.toThrow(/could not be deleted/);
    expect(h.api.delete).not.toHaveBeenCalled();
    expect(get(infoStore).notes).toHaveLength(1);
  });

  it('togglePin flips the flag and re-sorts pinned-first', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: 'a', is_pinned: false, updated_at: '2026-03-01' },
      { id: 'b', is_pinned: false, updated_at: '2026-01-01' },
    ]);
    await infoStore.loadNotes();
    await infoStore.togglePin('b', false);          // pin b
    expect(get(infoStore).notes.map(n => n.id)).toEqual(['b', 'a']);
    expect(h.api.update).toHaveBeenCalledWith('info_notes', 'b', { is_pinned: true });
  });

  it('setArchived maps the boolean to a status string', async () => {
    const note = { id: 'n1', status: 'active', is_pinned: false, updated_at: '2026-01-01' };
    h.api.get.mockResolvedValueOnce([note]);
    await infoStore.loadNotes();
    // Takes the NOTE, not an id: archiving a published note also unpublishes
    // it, and that decision needs its visibility.
    await infoStore.setArchived(note, true);
    expect(h.api.update).toHaveBeenCalledWith('info_notes', 'n1', { status: 'archived' });
    expect(get(infoStore).notes[0].status).toBe('archived');
  });

  it('setArchived UNPUBLISHES a published note as it archives it', async () => {
    // The divergence this closes: a note gone from the working list but still
    // readable by a resident on the public site.
    const note = {
      id: 'n2', status: 'active', visibility: 'public', published_at: '2026-01-01',
      is_pinned: false, updated_at: '2026-01-01',
    };
    h.api.get.mockResolvedValueOnce([note]);
    await infoStore.loadNotes();
    await infoStore.setArchived(note, true);

    expect(h.api.update).toHaveBeenCalledWith('info_notes', 'n2', {
      status: 'archived', visibility: 'internal', published_at: null,
    });
    expect(get(infoStore).notes[0].visibility).toBe('internal');
  });

  it('setArchived does not republish on restore', async () => {
    const note = { id: 'n3', status: 'archived', visibility: 'internal', is_pinned: false, updated_at: '2026-01-01' };
    h.api.get.mockResolvedValueOnce([note]);
    await infoStore.loadNotes();
    await infoStore.setArchived(note, false);

    expect(h.api.update).toHaveBeenCalledWith('info_notes', 'n3', { status: 'active' });
  });
});

describe('loadNote', () => {
  // Attachments are now owned by the shared AttachedDocuments panel (which uses
  // documentApi directly) — loadNote just fetches the note itself.
  it('fetches the note and stores it as selectedNote', async () => {
    h.api.getById.mockResolvedValueOnce({ id: 'n1', title: 'Note' });
    const note = await infoStore.loadNote('n1');
    expect(note.id).toBe('n1');
    expect(get(infoStore).selectedNote.id).toBe('n1');
  });
});
