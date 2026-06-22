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
  const supabase = { auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'tok' } } })) } };
  return { api, supabase, logAudit: vi.fn() };
});

vi.mock('$lib/utils/api',         () => ({ api: h.api }));
vi.mock('$lib/supabaseClient',    () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',      () => ({ getLogger: () => () => {} }));

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
    h.api.get.mockResolvedValueOnce([{ id: 'n1', status: 'active', is_pinned: false, updated_at: '2026-01-01' }]);
    await infoStore.loadNotes();
    await infoStore.setArchived('n1', true);
    expect(h.api.update).toHaveBeenCalledWith('info_notes', 'n1', { status: 'archived' });
    expect(get(infoStore).notes[0].status).toBe('archived');
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
