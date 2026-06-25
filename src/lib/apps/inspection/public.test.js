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

const { deleteWalkSession } = await import('./public.js');

beforeEach(() => vi.clearAllMocks());

describe('deleteWalkSession', () => {
  it('purges photos, deletes the inspections, then the session', async () => {
    await deleteWalkSession('sess9');

    expect(h.api.getAll).toHaveBeenCalledWith('component_inspections', { filters: { walk_session_id: 'sess9' } });
    expect(h.purgeAttachments).toHaveBeenCalledWith('component_inspection', ['insp-1', 'insp-2']);
    expect(h.api.deleteMany).toHaveBeenCalledWith('component_inspections', { walk_session_id: 'sess9' });
    expect(h.api.delete).toHaveBeenCalledWith('walk_sessions', 'sess9');
  });

  it('runs in FK-safe order: purge photos → inspections → session', async () => {
    await deleteWalkSession('sess9');
    const purge   = h.purgeAttachments.mock.invocationCallOrder[0];
    const delInsp = h.api.deleteMany.mock.invocationCallOrder[0];
    const delSess = h.api.delete.mock.invocationCallOrder[0];
    expect(purge).toBeLessThan(delInsp);
    expect(delInsp).toBeLessThan(delSess);
  });
});
