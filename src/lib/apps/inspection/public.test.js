// src/lib/apps/inspection/public.test.js
// The Inspection app's public interface — the cross-app contract for walk
// sessions (used by its own store AND the Building Assets inspections tab).
// Pins the session-delete cascade and its FK-safe order. Seams mocked: api,
// mediaAttachments.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: {
    get:        vi.fn(() => Promise.resolve([])),
    getAll:     vi.fn(() => Promise.resolve([{ id: 'insp-1' }, { id: 'insp-2' }])),
    deleteMany: vi.fn(() => Promise.resolve()),
    delete:     vi.fn(() => Promise.resolve()),
  },
  purgeAttachments: vi.fn(() => Promise.resolve()),
  listAttachments:  vi.fn(() => Promise.resolve([])),
}));

vi.mock('$lib/utils/api',                () => ({ api: h.api }));
vi.mock('$lib/utils/mediaAttachments.js', () => ({ purgeAttachments: h.purgeAttachments, listAttachments: h.listAttachments }));
vi.mock('$lib/utils/driveUtils.js',      () => ({ normalisePhotoUrl: (u) => `norm:${u}` }));
// public.js also imports the GT register path + authHeaders — stub the seams so
// importing the module doesn't pull $env/$app.
vi.mock('$lib/utils/authHeaders',        () => ({ authHeaders: vi.fn(async () => ({})) }));
vi.mock('$lib/apps/golden_thread/public.js', () => ({ registerDocument: vi.fn(), findDocumentBySource: vi.fn() }));

const { deleteWalkSession, listWalkSessions, loadSessionInspections } = await import('./public.js');

beforeEach(() => vi.clearAllMocks());

describe('deleteWalkSession', () => {
  it('purges photos (polymorphic, no FK) then deletes the session (cascade removes inspections)', async () => {
    await deleteWalkSession('sess9');

    expect(h.api.getAll).toHaveBeenCalledWith('component_inspections', { filters: { walk_session_id: 'sess9' } });
    expect(h.purgeAttachments).toHaveBeenCalledWith('component_inspection', ['insp-1', 'insp-2']);
    expect(h.api.delete).toHaveBeenCalledWith('walk_sessions', 'sess9');
    // component_inspections is NOT deleted directly — the FK cascade handles it
    // (the old deleteMany was a silent no-op under RLS).
    expect(h.api.deleteMany).not.toHaveBeenCalled();
  });

  it('purges photos BEFORE deleting the session (cascade would otherwise orphan the storage files)', async () => {
    await deleteWalkSession('sess9');
    const purge   = h.purgeAttachments.mock.invocationCallOrder[0];
    const delSess = h.api.delete.mock.invocationCallOrder[0];
    expect(purge).toBeLessThan(delSess);
  });
});

describe('listWalkSessions', () => {
  it('reads walk_sessions newest-first with the inspector joined', async () => {
    await listWalkSessions();
    expect(h.api.get).toHaveBeenCalledWith('walk_sessions', {
      select: '*, inspector:profiles!created_by(full_name)',
      orderBy: 'started_at', ascending: false,
    });
  });
});

describe('loadSessionInspections', () => {
  it('queries by session with the component/floor join, sorts oldest-first, merges photos', async () => {
    h.api.getAll.mockResolvedValueOnce([
      { id: 'i2', inspected_at: '2026-02-02T10:00:00Z' },
      { id: 'i1', inspected_at: '2026-02-01T10:00:00Z' },
    ]);
    h.listAttachments.mockResolvedValueOnce([
      { entity_id: 'i1', storage_url: 'a.jpg' },
      { entity_id: 'i1', storage_url: 'b.jpg' },
    ]);

    const rows = await loadSessionInspections('sess9', { withPhotos: true });

    expect(h.api.getAll).toHaveBeenCalledWith('component_inspections', expect.objectContaining({
      filters: { walk_session_id: 'sess9' },
      select: expect.stringContaining('component:components!component_id'),
    }));
    expect(rows.map(r => r.id)).toEqual(['i1', 'i2']);                 // sorted asc
    expect(h.listAttachments).toHaveBeenCalledWith('component_inspection', ['i1', 'i2']);
    expect(rows.find(r => r.id === 'i1').photo_urls).toEqual(['norm:a.jpg', 'norm:b.jpg']);
    expect(rows.find(r => r.id === 'i2').photo_urls).toEqual([]);
  });

  it('skips the photo query when withPhotos is false', async () => {
    h.api.getAll.mockResolvedValueOnce([{ id: 'i1', inspected_at: '2026-02-01T10:00:00Z' }]);
    await loadSessionInspections('sess9', { withPhotos: false });
    expect(h.listAttachments).not.toHaveBeenCalled();
  });
});
