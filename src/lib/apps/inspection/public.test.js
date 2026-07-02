// src/lib/apps/inspection/public.test.js
// The Inspection app's public interface — the cross-app contract for walk
// sessions (used by its own store AND the Building Assets inspections tab).
// Pins the session-delete cascade and its FK-safe order. Seams mocked: api,
// mediaAttachments.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: {
    getAll:     vi.fn(() => Promise.resolve([{ id: 'insp-1' }, { id: 'insp-2' }])),
    deleteMany: vi.fn(() => Promise.resolve()),
    delete:     vi.fn(() => Promise.resolve()),
  },
  purgeAttachments: vi.fn(() => Promise.resolve()),
}));

vi.mock('$lib/utils/api',                () => ({ api: h.api }));
vi.mock('$lib/utils/mediaAttachments.js', () => ({ purgeAttachments: h.purgeAttachments }));
// public.js now also imports the GT register path — stub the seams so importing
// the module doesn't pull $env/$app (this test only covers deleteWalkSession).
vi.mock('$lib/utils/authHeaders',        () => ({ authHeaders: vi.fn(async () => ({})) }));
vi.mock('$lib/apps/golden_thread/public.js', () => ({ registerDocument: vi.fn(), findDocumentBySource: vi.fn() }));

const { deleteWalkSession } = await import('./public.js');

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
