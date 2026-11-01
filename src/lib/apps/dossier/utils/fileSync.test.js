import { describe, it, expect } from 'vitest';
import { packStoragePath, desiredFolderPath, desiredPathFor, filesOutOfStep, filesUnderFolder, chunk } from './fileSync.js';

const pack = { id: 'abcdef12-0000-0000-0000-000000000000', title: 'Roof brief' };
const base = 'Dossier Packs/Roof brief (abcdef12)';
const folders = [
  { id: 'aaaaaaaa-1', name: 'Plans', parent_id: null },
  { id: 'bbbbbbbb-2', name: 'Old plans', parent_id: 'aaaaaaaa-1' },
];

describe('desired storage path', () => {
  it('is the pack folder at the top level', () => {
    expect(packStoragePath(pack)).toBe(base);
    expect(desiredFolderPath(pack, folders, null)).toBe(base);
  });
  it('adds one keyed segment per folder, top down', () => {
    expect(desiredFolderPath(pack, folders, 'bbbbbbbb-2')).toBe(`${base}/Plans (aaaaaaaa)/Old plans (bbbbbbbb)`);
  });
  it('follows a file\'s placement', () => {
    const placements = [{ document_id: 'f1', folder_id: 'aaaaaaaa-1' }];
    expect(desiredPathFor(pack, { id: 'f1' }, folders, placements)).toBe(`${base}/Plans (aaaaaaaa)`);
    expect(desiredPathFor(pack, { id: 'f2' }, folders, placements)).toBe(base);
  });
});

describe('filesOutOfStep', () => {
  const placements = [{ document_id: 'f1', folder_id: 'aaaaaaaa-1' }];
  it('lists files whose recorded folder is not where the tree puts them', () => {
    const files = [
      { id: 'f1', folder_path: base },                       // placed in Plans, still in the pack folder
      { id: 'f2', folder_path: base },                       // top level, in step
      { id: 'f3', folder_path: null },                       // never recorded
    ];
    expect(filesOutOfStep(pack, files, folders, placements).map((f) => f.id)).toEqual(['f1', 'f3']);
  });
  it('is empty when every file is where the tree puts it', () => {
    expect(filesOutOfStep(pack, [{ id: 'f1', folder_path: `${base}/Plans (aaaaaaaa)` }], folders, placements)).toEqual([]);
  });
  it('notices a renamed folder, since the keyed segment carries the new name', () => {
    const renamed = folders.map((f) => (f.id === 'aaaaaaaa-1' ? { ...f, name: 'Drawings' } : f));
    const files = [{ id: 'f1', folder_path: `${base}/Plans (aaaaaaaa)` }];
    expect(filesOutOfStep(pack, files, renamed, placements)).toHaveLength(1);
  });
});

describe('filesUnderFolder', () => {
  it('includes files in the folder and every folder below it', () => {
    const placements = [{ document_id: 'f1', folder_id: 'bbbbbbbb-2' }, { document_id: 'f2', folder_id: 'aaaaaaaa-1' }];
    const files = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
    expect(filesUnderFolder(folders, placements, files, 'aaaaaaaa-1').map((f) => f.id).sort()).toEqual(['f1', 'f2']);
    expect(filesUnderFolder(folders, placements, files, 'bbbbbbbb-2').map((f) => f.id)).toEqual(['f1']);
  });
});

describe('chunk', () => {
  it('splits a list into pieces of at most the size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
