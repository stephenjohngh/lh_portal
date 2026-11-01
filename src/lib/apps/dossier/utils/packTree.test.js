import { describe, it, expect } from 'vitest';
import { buildPackTree, flattenPackTree, packsUnder } from './packTree.js';

const F = (id, name, parent_id = null) => ({ id, name, parent_id });
const P = (id, title, folder_id = null) => ({ id, title, folder_id, status: 'active' });
const folders = [F('surveys', 'Surveys'), F('roofs', 'Roofs', 'surveys'), F('legal', 'Legal')];

describe('buildPackTree', () => {
  it('puts a pack in its folder, and a pack with none at the top', () => {
    const t = buildPackTree(folders, [P('a', 'Roof brief', 'roofs'), P('b', 'Loose')]);
    expect(t.rootPacks.map((p) => p.id)).toEqual(['b']);
    const roofs = t.folders.find((f) => f.id === 'surveys').children.find((f) => f.id === 'roofs');
    expect(roofs.packs.map((p) => p.id)).toEqual(['a']);
  });
  it('keeps the pack rows as they were (no helper fields leak)', () => {
    const t = buildPackTree(folders, [P('a', 'Roof brief', 'roofs')]);
    const roofs = t.folders.find((f) => f.id === 'surveys').children[0];
    expect(roofs.packs[0]).toEqual({ id: 'a', title: 'Roof brief', folder_id: 'roofs', status: 'active' });
  });
  it('shows a pack whose folder is missing at the top rather than losing it', () => {
    expect(buildPackTree(folders, [P('a', 'X', 'gone')]).rootPacks.map((p) => p.id)).toEqual(['a']);
  });
  it('sorts packs by title with numbers in order', () => {
    const t = buildPackTree([], [P('a', 'Flat 10'), P('b', 'Flat 2')]);
    expect(t.rootPacks.map((p) => p.title)).toEqual(['Flat 2', 'Flat 10']);
  });
  it('counts packs beneath a folder', () => {
    const t = buildPackTree(folders, [P('a', 'A', 'roofs'), P('b', 'B', 'surveys')]);
    expect(packsUnder(t.folders.find((f) => f.id === 'surveys'))).toBe(2);
  });
});

describe('flattenPackTree', () => {
  const tree = buildPackTree(folders, [P('a', 'A', 'roofs'), P('b', 'B', 'surveys'), P('c', 'C')]);
  const label = (r) => `${r.depth}:${r.type === 'folder' ? 'F-' + r.node.name : 'P-' + r.pack.title}`;

  it('lists folders then packs, indented by depth', () => {
    expect(flattenPackTree(tree).map(label)).toEqual([
      '0:F-Legal', '0:F-Surveys', '1:F-Roofs', '2:P-A', '1:P-B', '0:P-C',
    ]);
  });
  it('hides what is inside a collapsed folder, but not the folder', () => {
    expect(flattenPackTree(tree, { surveys: true }).map(label)).toEqual(['0:F-Legal', '0:F-Surveys', '0:P-C']);
  });
});
