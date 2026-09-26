// src/lib/server/pinnedCopies.test.js
import { describe, it, expect, vi } from 'vitest';

vi.mock('./storage/index.js', () => ({ ownerOf: () => { throw new Error('not in these tests'); } }));
const { removePinnedCopies } = await import('./pinnedCopies.js');

function providers() {
  const drive = { deleteFile: vi.fn(async () => {}) };
  const sb = { deleteFile: vi.fn(async () => {}) };
  const ownerOf = (name) => {
    if (!name || name === 'google_drive') return drive;
    if (name === 'supabase') return sb;
    throw new Error(`unknown provider ${name}`);
  };
  return { drive, sb, ownerOf };
}

describe('removePinnedCopies', () => {
  it('deletes each pinned copy from the provider it was pinned to', async () => {
    const p = providers();
    const out = await removePinnedCopies({ files: [
      { pinned_file_id: 'drive-pin', pinned_provider: 'google_drive' },
      { pinned_file_id: 'pins/x.pdf', pinned_provider: 'supabase' },
      { pinned_file_id: null },
    ] }, { ownerOf: p.ownerOf });
    expect(p.drive.deleteFile).toHaveBeenCalledWith('drive-pin');
    expect(p.sb.deleteFile).toHaveBeenCalledWith('pins/x.pdf');
    expect(out).toEqual({ removed: 2, failed: [] });
  });

  it('a copy pinned before the provider was recorded goes to the configured provider', async () => {
    const p = providers();
    await removePinnedCopies({ files: [{ pinned_file_id: 'old-pin' }] }, { ownerOf: p.ownerOf });
    expect(p.drive.deleteFile).toHaveBeenCalledWith('old-pin');
  });

  it('reports every copy it could not remove, so the caller can keep the publication', async () => {
    const p = providers();
    p.drive.deleteFile.mockRejectedValueOnce(new Error('Drive said no'));
    const out = await removePinnedCopies({ files: [
      { pinned_file_id: 'a' }, { pinned_file_id: 'b', pinned_provider: 'dropbox' }, { pinned_file_id: 'c' },
    ] }, { ownerOf: p.ownerOf });
    expect(out.removed).toBe(1);
    expect(out.failed.map(f => f.id)).toEqual(['a', 'b']);
  });
});
