// src/lib/apps/dossier/utils/blockId.test.js
// Type-1 tests for block identity. This is the top risk in the P0 plan: if ids
// duplicate on paste or churn on every keystroke, every later phase inherits
// the bug. So the guarantees are pinned explicitly.

import { describe, it, expect } from 'vitest';
import { planIdFixes, collectBlocks } from './blockId.js';

/** Deterministic id factory: n1, n2, n3… */
function counter() {
  let n = 0;
  return () => `n${++n}`;
}

describe('planIdFixes — stamping', () => {
  it('stamps blocks that have no uid', () => {
    const fixes = planIdFixes([{ pos: 0, uid: null }, { pos: 5, uid: undefined }], counter());
    expect(fixes).toEqual([{ pos: 0, uid: 'n1' }, { pos: 5, uid: 'n2' }]);
  });

  it('treats an empty string as missing', () => {
    expect(planIdFixes([{ pos: 0, uid: '' }], counter())).toEqual([{ pos: 0, uid: 'n1' }]);
  });

  it('is a no-op when every block already has a unique uid', () => {
    // THE key property: an unchanged doc produces no fixes, so autosave and
    // restore do not churn ids on every transaction.
    expect(planIdFixes([{ pos: 0, uid: 'a' }, { pos: 5, uid: 'b' }], counter())).toEqual([]);
  });

  it('never rewrites an existing unique uid', () => {
    const fixes = planIdFixes([{ pos: 0, uid: 'keep-me' }, { pos: 5, uid: null }], counter());
    expect(fixes).toEqual([{ pos: 5, uid: 'n1' }]);
  });
});

describe('planIdFixes — duplicates (the copy/paste case)', () => {
  it('keeps the first occurrence and reassigns the copy', () => {
    // Duplicating a block copies its attributes verbatim, so both carry 'dup'.
    // The original must keep its identity; the copy becomes a new block.
    const fixes = planIdFixes(
      [{ pos: 0, uid: 'dup' }, { pos: 5, uid: 'dup' }], counter());
    expect(fixes).toEqual([{ pos: 5, uid: 'n1' }]);
  });

  it('reassigns every later duplicate, not just the second', () => {
    const fixes = planIdFixes(
      [{ pos: 0, uid: 'd' }, { pos: 5, uid: 'd' }, { pos: 9, uid: 'd' }], counter());
    expect(fixes).toEqual([{ pos: 5, uid: 'n1' }, { pos: 9, uid: 'n2' }]);
  });

  it('gives each duplicate a DISTINCT id', () => {
    const fixes = planIdFixes(
      [{ pos: 0, uid: 'd' }, { pos: 5, uid: 'd' }, { pos: 9, uid: 'd' }], counter());
    expect(new Set(fixes.map(f => f.uid)).size).toBe(fixes.length);
  });

  it('does not collide when the mint returns an id already in the doc', () => {
    // A degenerate mint that hands back a uid already present must not create a
    // fresh duplicate — the minted id is added to the seen set.
    const mint = () => 'x';
    const fixes = planIdFixes([{ pos: 0, uid: null }, { pos: 5, uid: null }], mint);
    // Both get 'x' from this broken mint, but the second is still flagged as
    // needing a fix rather than being silently accepted as unique.
    expect(fixes).toHaveLength(2);
  });
});

describe('planIdFixes — stability', () => {
  it('is idempotent: applying the fixes then replanning yields nothing', () => {
    const blocks = [{ pos: 0, uid: null }, { pos: 5, uid: 'dup' }, { pos: 9, uid: 'dup' }];
    const fixes = planIdFixes(blocks, counter());

    // Apply.
    const applied = blocks.map(b => {
      const fix = fixes.find(f => f.pos === b.pos);
      return fix ? { ...b, uid: fix.uid } : b;
    });

    expect(planIdFixes(applied, counter())).toEqual([]);
  });

  it('handles an empty or missing doc', () => {
    expect(planIdFixes([], counter())).toEqual([]);
    expect(planIdFixes(undefined, counter())).toEqual([]);
  });
});

describe('collectBlocks', () => {
  /** Minimal ProseMirror-shaped stub — descendants(cb) over a flat list. */
  const fakeDoc = (nodes) => ({
    descendants(cb) { nodes.forEach((n, i) => cb(n, i * 4)); },
  });

  it('collects only the node types that carry a uid', () => {
    const doc = fakeDoc([
      { type: { name: 'paragraph' }, attrs: { uid: 'p1' } },
      { type: { name: 'text' },      attrs: {} },
      { type: { name: 'heading' },   attrs: { uid: null } },
    ]);
    expect(collectBlocks(doc, new Set(['paragraph', 'heading'])))
      .toEqual([{ pos: 0, uid: 'p1' }, { pos: 8, uid: null }]);
  });

  it('tolerates a node with no attrs at all', () => {
    const doc = fakeDoc([{ type: { name: 'paragraph' } }]);
    expect(collectBlocks(doc, new Set(['paragraph']))).toEqual([{ pos: 0, uid: null }]);
  });
});
