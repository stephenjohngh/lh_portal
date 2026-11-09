import { describe, it, expect } from 'vitest';
import { findUnnamed, idsIn, collectNamedIds } from './driveUnnamed.js';

const ID = (n) => `id${String(n).padStart(2, '0')}_ABCDEFGHIJKLMNOPQRSTUVW`;   // 28 chars, Drive-shaped
const folder = (n, parentId, path) => ({ fileId: ID(n), name: path.split('/').pop(), path, parentId, isFolder: true, size: 0, mimeType: 'folder', modifiedAt: null });
const file = (n, parentId, path, size) => ({ fileId: ID(n), name: path.split('/').pop(), path, parentId, isFolder: false, size, mimeType: 'application/pdf', modifiedAt: null });

const ROOT = 'root';
const items = [
  folder(1, ROOT, 'Dossier Packs'),
  folder(2, ID(1), 'Dossier Packs/Pack (a1)'),
  file(3, ID(2), 'Dossier Packs/Pack (a1)/kept.pdf', 100),
  file(4, ID(2), 'Dossier Packs/Pack (a1)/orphan.pdf', 250),
  folder(5, ROOT, 'Info Notes'),
  folder(6, ID(5), 'Info Notes/Gone (b2)'),
  file(7, ROOT, 'loose.txt', 5),
];

describe('findUnnamed', () => {
  const r = findUnnamed(items, new Set([ID(3)]));
  it('lists the files nothing names, with their paths and sizes', () => {
    expect(r.unnamed.map((f) => f.path)).toEqual(['Dossier Packs/Pack (a1)/orphan.pdf', 'loose.txt']);
    expect(r.totals).toMatchObject({ files: 3, folders: 4, bytes: 355, named: 1, namedBytes: 100, unnamed: 2, unnamedBytes: 255 });
  });
  it('lists folders with no file anywhere beneath them, and not one that holds a file deeper down', () => {
    expect(r.emptyFolders.map((f) => f.path)).toEqual(['Info Notes', 'Info Notes/Gone (b2)']);
    expect(r.totals.emptyFolders).toBe(2);
  });
});

describe('idsIn', () => {
  it('finds a Drive id in a view link, a download link and the proxy address', () => {
    expect(idsIn(`https://drive.google.com/file/d/${ID(9)}/view`)).toEqual([ID(9)]);
    expect(idsIn(`https://drive.google.com/uc?export=download&id=${ID(9)}`)).toEqual([ID(9)]);
    expect(idsIn(`/api/media/file/${ID(9)}`)).toEqual([ID(9)]);
    expect(idsIn(null)).toEqual([]);
  });
});

describe('collectNamedIds', () => {
  it('reads every place that names a file', async () => {
    const rows = {
      document_library: [{ id: 1, provider_file_id: ID(1) }],
      media_attachments: [{ id: 2, storage_url: `https://drive.google.com/file/d/${ID(2)}/view` }],
      maintenance_documents: [{ id: 3, storage_path: `https://drive.google.com/file/d/${ID(3)}/view` }],
      dossier_publications: [{ id: 4, manifest: { files: [{ pinned_file_id: ID(4) }, { pinned_file_id: null }] } }],
    };
    const db = { from: (t) => ({ select: () => ({ order: () => ({ range: async () => ({ data: rows[t], error: null }) }) }) }) };
    expect([...(await collectNamedIds(db))].sort()).toEqual([ID(1), ID(2), ID(3), ID(4)]);
  });
});
