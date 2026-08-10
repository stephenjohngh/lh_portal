// src/lib/apps/dossier/utils/blockId.js
// Stable block identity — pure, Type-1 testable, no ProseMirror.
//
// Every addressable block carries a `uid`. Deep links, backlinks and anchors at
// P1–P3 all resolve through it, and retrofitting ids onto existing content is
// far worse than paying for them now.
//
// ProseMirror gives no stable node identity of its own, so two things can go
// wrong and both must be handled:
//
//   1. A NEW block has no uid at all (typed, or pasted from outside).
//   2. A COPIED block carries the SAME uid as its original — copy/paste
//      duplicates attributes verbatim. Two blocks sharing an id silently break
//      every link that resolves by id.
//
// The rule: the FIRST occurrence in document order keeps its uid (so an
// existing block never changes identity, which is what makes restore and
// autosave idempotent); any later duplicate is reassigned.

import { newUuid } from '$lib/utils/uuid';

/**
 * Decide which blocks need a fresh uid.
 *
 * @param {{ pos: number, uid: string|null|undefined }[]} blocks - in document order
 * @param {() => string} [mint] - id factory; injectable so tests are deterministic
 * @returns {{ pos: number, uid: string }[]} fixes to apply; empty when nothing is wrong
 */
export function planIdFixes(blocks = [], mint = newUuid) {
  const seen = new Set();
  const fixes = [];

  for (const block of blocks) {
    const uid = block?.uid;
    if (!uid || seen.has(uid)) {
      const fresh = mint();
      fixes.push({ pos: block.pos, uid: fresh });
      seen.add(fresh);          // guard against a mint collision too
    } else {
      seen.add(uid);
    }
  }

  return fixes;
}

/**
 * Collect `{ pos, uid }` for every addressable node in a ProseMirror doc.
 * Split out from the plugin so the walk can be exercised without an editor.
 *
 * @param {{ descendants: Function }} doc - a ProseMirror node
 * @param {Set<string>} types - node type names that carry a uid
 */
export function collectBlocks(doc, types) {
  const blocks = [];
  doc.descendants((node, pos) => {
    if (types.has(node.type.name)) blocks.push({ pos, uid: node.attrs?.uid ?? null });
  });
  return blocks;
}
