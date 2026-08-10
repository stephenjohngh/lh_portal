// src/lib/apps/dossier/utils/docTree.test.js
// Type-1 pure-logic tests for the doc-tree primitives. These are the guards the
// UI cannot be trusted to remember, so they are tested hard.

import { describe, it, expect } from 'vitest';
import {
  buildTree, descendantIds, depthOf, subtreeHeight, nextOrderIndex,
  planMove, planReorder, planIndent, planOutdent, MAX_DEPTH,
} from './docTree.js';

/** Terse fixture helper: d('id', parent, order, title?) */
const d = (id, parent = null, order = 0, title = id) =>
  ({ id, parent_doc_id: parent, order_index: order, title });

// a
// ├─ b
// │  └─ d
// └─ c
const TREE = [d('a'), d('b', 'a', 0), d('c', 'a', 1), d('d', 'b', 0)];

describe('buildTree', () => {
  it('nests children under parents and sorts by order_index', () => {
    const roots = buildTree(TREE);
    expect(roots.map(r => r.id)).toEqual(['a']);
    expect(roots[0].children.map(c => c.id)).toEqual(['b', 'c']);
    expect(roots[0].children[0].children.map(c => c.id)).toEqual(['d']);
  });

  it('breaks ties on title when order_index matches', () => {
    const roots = buildTree([d('x', null, 0, 'Zebra'), d('y', null, 0, 'Alpha')]);
    expect(roots.map(r => r.title)).toEqual(['Alpha', 'Zebra']);
  });

  it('surfaces an orphan as a root rather than dropping it', () => {
    // 'lost' points at a parent that is not in the input.
    const roots = buildTree([d('a'), d('lost', 'missing-parent')]);
    expect(roots.map(r => r.id).sort()).toEqual(['a', 'lost']);
  });

  it('breaks a parent cycle instead of swallowing both rows', () => {
    // a→b→a: neither has a real root, so a naive build loses both.
    const roots = buildTree([d('a', 'b'), d('b', 'a')]);
    const ids = [];
    const walk = (n) => { ids.push(n.id); n.children.forEach(walk); };
    roots.forEach(walk);
    expect(ids.sort()).toEqual(['a', 'b']);        // both present
    expect(new Set(ids).size).toBe(2);             // and exactly once each
  });

  it('does not mutate the input rows', () => {
    const input = [d('a'), d('b', 'a')];
    buildTree(input);
    expect(input[0]).not.toHaveProperty('children');
  });
});

describe('descendantIds / depthOf / subtreeHeight', () => {
  it('collects the whole subtree, excluding the doc itself', () => {
    expect(descendantIds(TREE, 'a').sort()).toEqual(['b', 'c', 'd']);
    expect(descendantIds(TREE, 'b')).toEqual(['d']);
    expect(descendantIds(TREE, 'd')).toEqual([]);
  });

  it('reports 1-based depth', () => {
    expect(depthOf(TREE, 'a')).toBe(1);
    expect(depthOf(TREE, 'b')).toBe(2);
    expect(depthOf(TREE, 'd')).toBe(3);
    expect(depthOf(TREE, 'nope')).toBe(0);
  });

  it('terminates on a cycle instead of hanging', () => {
    expect(depthOf([d('a', 'b'), d('b', 'a')], 'a')).toBeLessThan(10);
    expect(descendantIds([d('a', 'b'), d('b', 'a')], 'a')).toContain('b');
  });

  it('measures height below a doc', () => {
    expect(subtreeHeight(TREE, 'a')).toBe(2);
    expect(subtreeHeight(TREE, 'b')).toBe(1);
    expect(subtreeHeight(TREE, 'd')).toBe(0);
  });
});

describe('nextOrderIndex', () => {
  it('appends after the highest sibling', () => {
    expect(nextOrderIndex(TREE, 'a')).toBe(2);
    expect(nextOrderIndex(TREE, null)).toBe(1);
    expect(nextOrderIndex([], null)).toBe(0);
  });
});

describe('planMove — guards', () => {
  it('refuses an unknown doc or parent', () => {
    expect(planMove(TREE, { docId: 'nope' })).toMatchObject({ ok: false, reason: 'not-found' });
    expect(planMove(TREE, { docId: 'b', newParentId: 'nope' }))
      .toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('refuses to make a doc its own parent', () => {
    expect(planMove(TREE, { docId: 'a', newParentId: 'a' }))
      .toMatchObject({ ok: false, reason: 'cycle' });
  });

  it('refuses to move a doc inside its own descendant', () => {
    expect(planMove(TREE, { docId: 'a', newParentId: 'd' }))
      .toMatchObject({ ok: false, reason: 'cycle' });
  });

  it('counts the moved subtree height against the depth cap, not just the node', () => {
    // A chain 5 deep: l1..l5. Moving l1 (height 4) under l1 is a cycle, so use
    // a separate 2-tall branch and a deep target.
    const deep = [
      d('l1'), d('l2', 'l1'), d('l3', 'l2'), d('l4', 'l3'),
      d('br'), d('br2', 'br'),           // branch with height 1
    ];
    // br (height 1) under l4 (depth 4) → deepest 6 > MAX_DEPTH
    const res = planMove(deep, { docId: 'br', newParentId: 'l4' });
    expect(res).toMatchObject({ ok: false, reason: 'depth' });
    expect(res.depth).toBeGreaterThan(MAX_DEPTH);

    // The same branch under l3 (depth 3) lands at 5 — allowed, but flagged.
    const ok = planMove(deep, { docId: 'br', newParentId: 'l3' });
    expect(ok.ok).toBe(true);
    expect(ok.depth).toBe(5);
    expect(ok.warning).toBe('deep');
  });
});

describe('planMove — patches', () => {
  it('re-parents the doc and reindexes both sibling lists', () => {
    // Move 'd' (under b) to be a's first child.
    const res = planMove(TREE, { docId: 'd', newParentId: 'a', newIndex: 0 });
    expect(res.ok).toBe(true);
    const byId = Object.fromEntries(res.patches.map(p => [p.id, p]));
    expect(byId.d).toMatchObject({ parent_doc_id: 'a', order_index: 0 });
    // b and c shuffle down to make room.
    expect(byId.b).toMatchObject({ order_index: 1 });
    expect(byId.c).toMatchObject({ order_index: 2 });
  });

  it('emits no patch for rows whose position is unchanged', () => {
    // Moving 'b' to index 0 under 'a' is where it already is.
    const res = planMove(TREE, { docId: 'b', newParentId: 'a', newIndex: 0 });
    expect(res.ok).toBe(true);
    expect(res.patches).toEqual([]);
  });

  it('clamps an out-of-range index instead of leaving a hole', () => {
    const res = planMove(TREE, { docId: 'b', newParentId: 'a', newIndex: 99 });
    const byId = Object.fromEntries(res.patches.map(p => [p.id, p]));
    expect(byId.b.order_index).toBe(1);   // last valid slot, not 99
  });

  it('promotes a doc to top level with a null parent', () => {
    const res = planMove(TREE, { docId: 'd', newParentId: null, newIndex: 0 });
    const byId = Object.fromEntries(res.patches.map(p => [p.id, p]));
    expect(byId.d).toMatchObject({ parent_doc_id: null, order_index: 0 });
  });
});

describe('planReorder / planIndent / planOutdent', () => {
  it('reorders within the sibling list', () => {
    const res = planReorder(TREE, 'b', +1);      // b down past c
    const byId = Object.fromEntries(res.patches.map(p => [p.id, p]));
    expect(byId.b.order_index).toBe(1);
    expect(byId.c.order_index).toBe(0);
  });

  it('refuses to reorder past either end', () => {
    expect(planReorder(TREE, 'b', -1).ok).toBe(false);
    expect(planReorder(TREE, 'c', +1).ok).toBe(false);
  });

  it('indents under the sibling above', () => {
    const res = planIndent(TREE, 'c');           // c becomes a child of b
    const byId = Object.fromEntries(res.patches.map(p => [p.id, p]));
    expect(byId.c).toMatchObject({ parent_doc_id: 'b' });
  });

  it('refuses to indent the first sibling — there is nothing above it', () => {
    expect(planIndent(TREE, 'b').ok).toBe(false);
  });

  it('outdents to become the parent-s next sibling', () => {
    const res = planOutdent(TREE, 'd');          // d: child of b → sibling of b
    const byId = Object.fromEntries(res.patches.map(p => [p.id, p]));
    expect(byId.d).toMatchObject({ parent_doc_id: 'a', order_index: 1 });
  });

  it('refuses to outdent a top-level doc', () => {
    expect(planOutdent(TREE, 'a').ok).toBe(false);
  });
});
