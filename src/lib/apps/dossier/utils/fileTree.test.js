import { describe, it, expect } from 'vitest';
import {
  buildFileTree, folderNames, storageSegments, descendantFolderIds, folderMoveTargets,
  folderNameProblem, filesUnder, MAX_FOLDER_DEPTH, flattenFileTree,
} from './fileTree.js';

const F = (id, name, parent_id = null) => ({ id, name, parent_id });
const D = (id, name = id) => ({ id, display_name: name });
const folders = [F('plans', 'Plans'), F('old', 'Old plans', 'plans'), F('new', 'New plans', 'plans'), F('photos', 'Photos')];

describe('buildFileTree', () => {
  it('puts a file in its folder and an unplaced file at the top', () => {
    const t = buildFileTree(folders, [D('a'), D('b'), D('c')], [{ document_id: 'a', folder_id: 'old' }]);
    expect(t.rootFiles.map((f) => f.id)).toEqual(['b', 'c']);
    const plans = t.folders.find((n) => n.id === 'plans');
    expect(plans.children.find((n) => n.id === 'old').files.map((f) => f.id)).toEqual(['a']);
  });
  it('shows a file whose folder is missing at the top rather than losing it', () => {
    const t = buildFileTree(folders, [D('a')], [{ document_id: 'a', folder_id: 'gone' }]);
    expect(t.rootFiles.map((f) => f.id)).toEqual(['a']);
  });
  it('sorts siblings by name with numbers in order', () => {
    const t = buildFileTree([F('x', 'Floor 10'), F('y', 'Floor 2')], [], []);
    expect(t.folders.map((n) => n.name)).toEqual(['Floor 2', 'Floor 10']);
  });
  it('survives a parent cycle without dropping a folder', () => {
    const t = buildFileTree([F('a', 'A', 'b'), F('b', 'B', 'a')], [], []);
    const all = [];
    const walk = (n) => { all.push(n.id); n.children.forEach(walk); };
    t.folders.forEach(walk);
    expect(all.sort()).toEqual(['a', 'b']);
  });
  it('counts files beneath a folder', () => {
    const t = buildFileTree(folders, [D('a'), D('b')],
      [{ document_id: 'a', folder_id: 'old' }, { document_id: 'b', folder_id: 'new' }]);
    expect(filesUnder(t.folders.find((n) => n.id === 'plans'))).toBe(2);
  });
});

describe('paths', () => {
  it('names a position from the top down', () => expect(folderNames(folders, 'old')).toEqual(['Plans', 'Old plans']));
  it('is empty at the top level', () => expect(folderNames(folders, null)).toEqual([]));
  it('keys storage folders by id so a rename keeps the same folder', () => {
    const before = storageSegments(folders, 'old')[1];
    const after = storageSegments(folders.map((f) => (f.id === 'old' ? { ...f, name: 'Archive' } : f)), 'old')[1];
    const key = (s) => s.slice(s.lastIndexOf('('));
    expect(key(after)).toBe(key(before));
    expect(after).not.toBe(before);
  });
  it('makes unsafe names safe', () => {
    expect(storageSegments([F('abcdef12-0000', 'A/B')], 'abcdef12-0000')[0]).toBe('A B (abcdef12)');
  });
});

describe('moving a folder', () => {
  it('never offers itself or anything inside it', () => {
    const t = folderMoveTargets(folders, 'plans');
    expect(t).not.toContain('plans');
    expect(t).not.toContain('old');
    expect(t).toContain('photos');
  });
  it('offers the top level unless it is already there', () => {
    expect(folderMoveTargets(folders, 'old')).toContain(null);
    expect(folderMoveTargets(folders, 'plans')).not.toContain(null);
  });
  it('refuses a target that would make the tree too deep', () => {
    const deep = [F('1', '1')];
    for (let i = 2; i <= MAX_FOLDER_DEPTH; i++) deep.push(F(String(i), String(i), String(i - 1)));
    deep.push(F('x', 'x'), F('y', 'y', 'x'));
    expect(folderMoveTargets(deep, 'x')).not.toContain(String(MAX_FOLDER_DEPTH));
    expect(folderMoveTargets(deep, 'x')).toContain('1');
  });
  it('lists descendants', () => expect(descendantFolderIds(folders, 'plans').sort()).toEqual(['new', 'old']));
});

describe('folderNameProblem', () => {
  it('rejects empty, long and duplicate-among-siblings names', () => {
    expect(folderNameProblem(folders, null, '  ')).toMatch(/name/);
    expect(folderNameProblem(folders, null, 'x'.repeat(81))).toMatch(/80/);
    expect(folderNameProblem(folders, null, 'photos')).toMatch(/already/);
  });
  it('allows the same name under another parent, and a folder keeping its own name', () => {
    expect(folderNameProblem(folders, 'plans', 'Photos')).toBe('');
    expect(folderNameProblem(folders, null, 'Photos', 'photos')).toBe('');
  });
});

describe('flattenFileTree', () => {
  const folders = [
    { id: 'p', name: 'Plans', parent_id: null },
    { id: 'o', name: 'Old plans', parent_id: 'p' },
  ];
  const files = [
    { id: 'a', filename: 'a.pdf' }, { id: 'b', filename: 'b.pdf' }, { id: 'c', filename: 'c.pdf' },
  ];
  const placements = [{ document_id: 'a', folder_id: 'p' }, { document_id: 'b', folder_id: 'o' }];
  const tree = buildFileTree(folders, files, placements);

  it('lists folders, their contents indented, then top-level files', () => {
    const rows = flattenFileTree(tree).map(r => `${r.depth}:${r.type === 'folder' ? 'D' + r.node.id : r.file.id}`);
    expect(rows).toEqual(['0:Dp', '1:Do', '2:b', '1:a', '0:c']);
  });

  it('counts the files beneath a folder, sub-folders included', () => {
    expect(flattenFileTree(tree)[0].count).toBe(2);
  });

  it('hides the contents of a collapsed folder but keeps its row', () => {
    const rows = flattenFileTree(tree, { p: true }).map(r => r.type === 'folder' ? 'D' + r.node.id : r.file.id);
    expect(rows).toEqual(['Dp', 'c']);
  });
});
