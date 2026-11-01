// src/lib/apps/dossier/utils/packTree.js
// The pack list as a tree — pure, no Svelte, no I/O.
//
// Folders (dossier_pack_folders) organise packs; a pack's folder is its own
// `folder_id` column and NULL means the top level of its section. Templates and
// dossiers are two separate sections, each with its own folders, so a tree is
// always built for ONE kind. The folder rules (depth, cycles, names) are the same
// as the file tree's, so those helpers are reused rather than written twice.

import { buildFileTree, filesUnder } from './fileTree.js';

export { folderMoveTargets, folderNameProblem, descendantFolderIds, folderLabel, MAX_FOLDER_DEPTH } from './fileTree.js';

/**
 * The tree for one section.
 * @param {object[]} folders  folders of ONE kind
 * @param {object[]} packs    packs of the matching kind (templates, or dossiers)
 * @returns {{ folders: object[], rootPacks: object[] }}
 *   folder nodes: `{ ...folder, children, packs }`
 */
export function buildPackTree(folders = [], packs = []) {
  const asItems = packs.map((p) => ({ ...p, display_name: p.title }));
  const placements = packs.filter((p) => p.folder_id).map((p) => ({ document_id: p.id, folder_id: p.folder_id }));
  const tree = buildFileTree(folders, asItems, placements);
  const rename = (nodes) => nodes.map((n) => {
    const { files, ...rest } = n;
    return { ...rest, packs: files.map(({ display_name, ...p }) => p), children: rename(n.children) };
  });
  return {
    folders: rename(tree.folders),
    rootPacks: tree.rootFiles.map(({ display_name, ...p }) => p),
  };
}

/** Packs in a folder and everything beneath it. */
export function packsUnder(node) {
  return filesUnder({ files: node.packs, children: node.children.map((c) => ({ files: c.packs, children: c.children })) });
}

/**
 * The tree as one flat list of rows, in display order, for a single `{#each}` —
 * folders first, then packs, each with its depth. A collapsed folder hides what is
 * inside it. Flat, because the row for a pack is large and a recursive component
 * would have to forward all of it.
 * @param {{ folders: object[], rootPacks: object[] }} tree
 * @param {Record<string, boolean>} [collapsed] folder id → true when closed
 * @returns {({ type: 'folder', node: object, depth: number } | { type: 'pack', pack: object, depth: number })[]}
 */
export function flattenPackTree(tree, collapsed = {}) {
  const out = [];
  const walk = (folders, packs, depth) => {
    for (const node of folders) {
      out.push({ type: 'folder', node, depth });
      if (!collapsed[node.id]) walk(node.children, node.packs, depth + 1);
    }
    for (const pack of packs) out.push({ type: 'pack', pack, depth });
  };
  walk(tree.folders, tree.rootPacks, 0);
  return out;
}
