// src/lib/apps/dossier/utils/docTree.js
// The doc-tree primitives — pure, Type-1 testable, no Svelte, no I/O.
//
// Every structural operation the UI offers (reorder, indent, outdent, drag)
// funnels through planMove(), which returns the minimal set of row patches to
// persist. Keeping that in one pure function is what makes the tree safe: the
// cycle guard and the depth cap cannot be forgotten by a caller.

/** Deepest level a doc may sit at. Level 1 = a top-level doc in the pack. */
export const MAX_DEPTH = 5;
/** Warn (but allow) at or beyond this level — spec 2 §8.2 soft-warns past 4. */
export const WARN_DEPTH = 4;

const parentOf = (doc) => doc?.parent_doc_id ?? null;

function byOrder(a, b) {
  return (a.order_index - b.order_index) || String(a.title).localeCompare(String(b.title));
}

/**
 * Nest a flat doc list into a sorted tree of `{ ...doc, children: [] }`.
 *
 * Robustness matters more than purity here: a doc whose parent is missing
 * (deleted, or filtered out of the input) surfaces as a root rather than
 * vanishing, and a parent cycle (a→b→a) is broken instead of swallowing both
 * rows. Losing a doc silently is far worse than showing it in the wrong place.
 *
 * @param {object[]} docs
 * @returns {object[]} root nodes
 */
export function buildTree(docs = []) {
  const byId = new Map(docs.map(d => [d.id, { ...d, children: [] }]));
  const roots = [];

  for (const node of byId.values()) {
    const parent = parentOf(node) ? byId.get(parentOf(node)) : null;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  // Anything unreachable from a root is in a cycle — promote it to a root and
  // detach it from its parent so it appears exactly once.
  const seen = new Set();
  const walk = (n) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    n.children.forEach(walk);
  };
  roots.forEach(walk);

  for (const node of byId.values()) {
    if (seen.has(node.id)) continue;
    const parent = byId.get(parentOf(node));
    if (parent) parent.children = parent.children.filter(c => c.id !== node.id);
    roots.push(node);
    walk(node);
  }

  const sortRec = (nodes) => { nodes.sort(byOrder); nodes.forEach(n => sortRec(n.children)); };
  sortRec(roots);
  return roots;
}

/** Every id beneath `id`, excluding `id` itself. */
export function descendantIds(docs = [], id) {
  const childrenOf = new Map();
  for (const d of docs) {
    const p = parentOf(d);
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push(d.id);
  }
  const out = [];
  const stack = [...(childrenOf.get(id) ?? [])];
  const seen = new Set([id]);
  while (stack.length) {
    const next = stack.pop();
    if (seen.has(next)) continue;      // cycle safety
    seen.add(next);
    out.push(next);
    stack.push(...(childrenOf.get(next) ?? []));
  }
  return out;
}

/** 1-based level of a doc. A top-level doc is 1. Returns 0 when not found. */
export function depthOf(docs = [], id) {
  const byId = new Map(docs.map(d => [d.id, d]));
  let node = byId.get(id);
  if (!node) return 0;
  let depth = 1;
  const seen = new Set([id]);
  while (parentOf(node)) {
    const parent = byId.get(parentOf(node));
    if (!parent || seen.has(parent.id)) break;   // orphan or cycle → stop
    seen.add(parent.id);
    node = parent;
    depth++;
  }
  return depth;
}

/** Levels below a doc. A leaf is 0; a doc with grandchildren is 2. */
export function subtreeHeight(docs = [], id) {
  const kids = docs.filter(d => parentOf(d) === id);
  if (!kids.length) return 0;
  return 1 + Math.max(...kids.map(k => subtreeHeight(docs, k.id)));
}

/** order_index for a new doc appended under `parentId`. */
export function nextOrderIndex(docs = [], parentId = null) {
  const siblings = docs.filter(d => parentOf(d) === (parentId ?? null));
  return siblings.length ? Math.max(...siblings.map(d => d.order_index ?? 0)) + 1 : 0;
}

/**
 * Work out how to move a doc, without touching the DB.
 *
 * @param {object[]} docs
 * @param {{ docId: string, newParentId?: string|null, newIndex?: number }} move
 * @returns {{ ok: true, patches: object[], depth: number, warning: string|null }
 *          | { ok: false, reason: 'not-found'|'cycle'|'depth', depth?: number }}
 */
export function planMove(docs = [], { docId, newParentId = null, newIndex = 0 }) {
  const byId = new Map(docs.map(d => [d.id, d]));
  const doc = byId.get(docId);
  const target = newParentId ?? null;

  if (!doc) return { ok: false, reason: 'not-found' };
  if (target !== null && !byId.has(target)) return { ok: false, reason: 'not-found' };

  // A doc cannot become its own ancestor — this is the tree's cycle guard, and
  // the reason every move goes through here.
  if (target === docId) return { ok: false, reason: 'cycle' };
  if (target !== null && descendantIds(docs, docId).includes(target)) {
    return { ok: false, reason: 'cycle' };
  }

  // The whole subtree moves, so the cap must consider its height, not just the
  // moved node: dragging a 2-deep branch under a level-4 parent lands at 6.
  const parentDepth = target === null ? 0 : depthOf(docs, target);
  const deepest = parentDepth + 1 + subtreeHeight(docs, docId);
  if (deepest > MAX_DEPTH) return { ok: false, reason: 'depth', depth: deepest };

  const oldParent = parentOf(doc);
  const siblingsOf = (pid) =>
    docs.filter(d => parentOf(d) === pid && d.id !== docId).sort(byOrder);

  const dest = siblingsOf(target);
  dest.splice(Math.max(0, Math.min(newIndex, dest.length)), 0, doc);

  const patches = [];
  dest.forEach((d, i) => {
    if (d.id === docId) {
      if (oldParent !== target || d.order_index !== i) {
        patches.push({ id: d.id, parent_doc_id: target, order_index: i });
      }
    } else if (d.order_index !== i) {
      patches.push({ id: d.id, order_index: i });
    }
  });

  // Close the gap the doc left behind when it changed parent.
  if (oldParent !== target) {
    siblingsOf(oldParent).forEach((d, i) => {
      if (d.order_index !== i) patches.push({ id: d.id, order_index: i });
    });
  }

  return {
    ok: true,
    patches,
    depth: deepest,
    warning: deepest >= WARN_DEPTH ? 'deep' : null,
  };
}

/**
 * Convenience wrappers the toolbar uses. Each resolves to a planMove() call so
 * the guards apply uniformly.
 */
export function planReorder(docs, docId, delta) {
  const doc = docs.find(d => d.id === docId);
  if (!doc) return { ok: false, reason: 'not-found' };
  const siblings = docs.filter(d => parentOf(d) === parentOf(doc)).sort(byOrder);
  const from = siblings.findIndex(d => d.id === docId);
  const to = from + delta;
  if (to < 0 || to >= siblings.length) return { ok: false, reason: 'not-found' };
  return planMove(docs, { docId, newParentId: parentOf(doc), newIndex: to });
}

/** Indent = become a child of the sibling immediately above. */
export function planIndent(docs, docId) {
  const doc = docs.find(d => d.id === docId);
  if (!doc) return { ok: false, reason: 'not-found' };
  const siblings = docs.filter(d => parentOf(d) === parentOf(doc)).sort(byOrder);
  const idx = siblings.findIndex(d => d.id === docId);
  if (idx <= 0) return { ok: false, reason: 'not-found' };   // nothing to indent under
  const newParent = siblings[idx - 1];
  return planMove(docs, {
    docId,
    newParentId: newParent.id,
    newIndex: docs.filter(d => parentOf(d) === newParent.id).length,
  });
}

/** Outdent = become the next sibling of the current parent. */
export function planOutdent(docs, docId) {
  const doc = docs.find(d => d.id === docId);
  if (!doc) return { ok: false, reason: 'not-found' };
  const parent = docs.find(d => d.id === parentOf(doc));
  if (!parent) return { ok: false, reason: 'not-found' };    // already top level
  const grandParent = parentOf(parent);
  const uncles = docs.filter(d => parentOf(d) === grandParent).sort(byOrder);
  const parentIdx = uncles.findIndex(d => d.id === parent.id);
  return planMove(docs, { docId, newParentId: grandParent, newIndex: parentIdx + 1 });
}
