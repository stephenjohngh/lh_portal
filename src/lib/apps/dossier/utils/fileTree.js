// src/lib/apps/dossier/utils/fileTree.js
// A pack's file tree — pure, no Svelte, no I/O.
//
// Folders are rows (dossier_folders); a file's place is a row in
// dossier_file_placements, and NO row means the top level. The database enforces
// the real rules (same pack, no cycles, depth); these helpers exist so the screen
// can say why before anything is pressed, and so every place that needs a folder's
// name or path derives it the same way.

import { sanitiseFolderSegment } from '#lib/utils/documentUtils.js';

/** Deepest a folder may sit. Level 1 = a top-level folder. Mirrors the database. */
export const MAX_FOLDER_DEPTH = 6;

const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name ?? '', b.name ?? '');
const parentOf = (f) => f?.parent_id ?? null;
const fileName = (f) => f.display_name || f.filename || '';

/** file id → folder id, for files that are not at the top level. */
export function placementMap(placements = []) {
  return new Map(placements.map((p) => [p.document_id, p.folder_id]));
}

/**
 * The tree for display. A file whose folder is missing (deleted, or filtered out)
 * shows at the top level rather than vanishing — losing a file silently is worse
 * than showing it in the wrong place.
 * @returns {{ folders: object[], rootFiles: object[] }}
 *   folders: nodes `{ ...folder, children: [], files: [] }`, siblings by name
 */
export function buildFileTree(folders = [], files = [], placements = []) {
  const nodes = new Map(folders.map((f) => [f.id, { ...f, children: [], files: [] }]));
  const roots = [];
  for (const n of nodes.values()) {
    const parent = parentOf(n) ? nodes.get(parentOf(n)) : null;
    if (parent && parent.id !== n.id) parent.children.push(n); else roots.push(n);
  }

  // Anything unreachable from a root is in a cycle — promote it so it appears once.
  const seen = new Set();
  const walk = (n) => { if (seen.has(n.id)) return; seen.add(n.id); n.children.forEach(walk); };
  roots.forEach(walk);
  for (const n of nodes.values()) {
    if (seen.has(n.id)) continue;
    const parent = nodes.get(parentOf(n));
    if (parent) parent.children = parent.children.filter((c) => c.id !== n.id);
    roots.push(n);
    walk(n);
  }

  const place = placementMap(placements);
  const rootFiles = [];
  for (const file of files) {
    const node = nodes.get(place.get(file.id));
    if (node) node.files.push(file); else rootFiles.push(file);
  }
  const sortRec = (list) => {
    list.sort(byName);
    for (const n of list) {
      n.files.sort((a, b) => collator.compare(fileName(a), fileName(b)));
      sortRec(n.children);
    }
  };
  sortRec(roots);
  rootFiles.sort((a, b) => collator.compare(fileName(a), fileName(b)));
  return { folders: roots, rootFiles };
}

/** Folder names from the top down to `folderId`, inclusive. [] for the top level. */
export function folderNames(folders = [], folderId) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = [];
  const seen = new Set();
  let cur = byId.get(folderId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur.name);
    cur = byId.get(parentOf(cur));
  }
  return out;
}

/** "Plans / Old plans" for display; '' at the top level. */
export function folderLabel(folders, folderId) {
  return folderNames(folders, folderId).join(' / ');
}

/**
 * The storage-folder segments under the pack's own folder for a position in the
 * tree. Each is `<name> (<short id>)` — the same key scheme as a pack's folder, so
 * the Drive provider finds a folder by its id suffix and a rename does not start a
 * second one. An empty name still yields the short id.
 */
export function storageSegments(folders = [], folderId) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = [];
  const seen = new Set();
  let cur = byId.get(folderId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const short = String(cur.id).replace(/-/g, '').slice(0, 8);
    const name = sanitiseFolderSegment(cur.name);
    out.unshift(name ? `${name} (${short})` : short);
    cur = byId.get(parentOf(cur));
  }
  return out;
}

/** Every folder id beneath `id`, excluding `id`. */
export function descendantFolderIds(folders = [], id) {
  const kids = new Map();
  for (const f of folders) {
    const p = parentOf(f);
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(f.id);
  }
  const out = [];
  const seen = new Set([id]);
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop();
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    stack.push(...(kids.get(next) ?? []));
  }
  return out;
}

/** 1 for a top-level folder. */
export function folderDepth(folders = [], id) {
  return folderNames(folders, id).length;
}

/** How many levels the subtree under `id` adds below `id` itself (0 for a leaf). */
function heightBelow(folders, id, seen = new Set()) {
  if (seen.has(id)) return 0;
  seen.add(id);
  const kids = folders.filter((f) => parentOf(f) === id);
  return kids.length ? 1 + Math.max(...kids.map((k) => heightBelow(folders, k.id, seen))) : 0;
}

/**
 * Where a folder may be moved: the top level (null) and any folder that is not
 * itself or inside it, with room for it and everything below it.
 * @returns {(string|null)[]} parent ids; null = the top level
 */
export function folderMoveTargets(folders = [], id) {
  const blocked = new Set([id, ...descendantFolderIds(folders, id)]);
  const height = 1 + heightBelow(folders, id);
  const targets = folders
    .filter((f) => !blocked.has(f.id) && folderDepth(folders, f.id) + height <= MAX_FOLDER_DEPTH)
    .sort((a, b) => collator.compare(folderLabel(folders, a.id), folderLabel(folders, b.id)))
    .map((f) => f.id);
  const atTop = parentOf(folders.find((f) => f.id === id)) === null;
  return atTop ? targets : [null, ...targets];
}

/** Is `name` already used by a sibling under `parentId`? Case-insensitive. */
export function siblingNameTaken(folders = [], parentId, name, exceptId = null) {
  const want = String(name ?? '').trim().toLowerCase();
  return folders.some((f) => f.id !== exceptId && parentOf(f) === (parentId ?? null)
    && String(f.name).trim().toLowerCase() === want);
}

/** Why a folder name cannot be used, or '' when it can. */
export function folderNameProblem(folders, parentId, name, exceptId = null) {
  const n = String(name ?? '').trim();
  if (!n) return 'Give the folder a name.';
  if (n.length > 80) return 'Folder names can be at most 80 characters.';
  if (siblingNameTaken(folders, parentId, n, exceptId)) return 'There is already a folder with that name here.';
  return '';
}

/** Every file in a folder and below it (for a count shown beside a folder). */
export function filesUnder(node) {
  return node.files.length + node.children.reduce((n, c) => n + filesUnder(c), 0);
}

/**
 * The tree as one list of rows in display order, for a picker that cannot nest
 * components: each folder, then (unless collapsed) its sub-folders and files, then
 * the top-level files. A folder row carries the count of files beneath it.
 * @param {{ folders: object[], rootFiles: object[] }} tree from buildFileTree
 * @param {Record<string, boolean>} [collapsed] folder id → hidden contents
 * @returns {Array<{ type: 'folder', node: object, depth: number, count: number }
 *   | { type: 'file', file: object, depth: number }>}
 */
export function flattenFileTree(tree, collapsed = {}) {
  const rows = [];
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      rows.push({ type: 'folder', node: n, depth, count: filesUnder(n) });
      if (collapsed[n.id]) continue;
      walk(n.children, depth + 1);
      for (const file of n.files) rows.push({ type: 'file', file, depth: depth + 1 });
    }
  };
  walk(tree.folders, 0);
  for (const file of tree.rootFiles) rows.push({ type: 'file', file, depth: 0 });
  return rows;
}
