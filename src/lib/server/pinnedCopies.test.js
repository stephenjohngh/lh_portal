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

  it('bins the emptied publish folder and pack folder, never _published', async () => {
    const names = { pub: '2026-11-09 14.32', pack: 'Flat 4 (1a2b3c4d)', root: '_published' };
    const parent = { pin: 'pub', pub: 'pack', pack: 'root', old: 'root' };
    const drive = {
      deleteFile: vi.fn(async () => {}),
      parentFolderOf: vi.fn(async (id) => parent[id]),
      getFileMetadata: vi.fn(async (id) => ({ name: names[id] })),
      trashFolderIfEmpty: vi.fn(async () => true),
    };
    await removePinnedCopies({ files: [{ pinned_file_id: 'pin' }] }, { ownerOf: () => drive });
    expect(drive.trashFolderIfEmpty.mock.calls.map(c => c[0])).toEqual(['pub', 'pack']);

    drive.trashFolderIfEmpty.mockClear();
    await removePinnedCopies({ files: [{ pinned_file_id: 'old' }] }, { ownerOf: () => drive });
    expect(drive.trashFolderIfEmpty).not.toHaveBeenCalled();     // a copy from before, straight in _published
  });

  it('a folder that cannot be tidied does not fail the delete', async () => {
    const drive = {
      deleteFile: vi.fn(async () => {}),
      parentFolderOf: vi.fn(async () => 'pub'),
      getFileMetadata: vi.fn(async () => { throw new Error('Drive said no'); }),
      trashFolderIfEmpty: vi.fn(),
    };
    const out = await removePinnedCopies({ files: [{ pinned_file_id: 'pin' }] }, { ownerOf: () => drive });
    expect(out).toEqual({ removed: 1, failed: [] });
  });
});
