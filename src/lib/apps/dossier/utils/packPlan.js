// src/lib/apps/dossier/utils/packPlan.js
// The PLAN for building a pack without anybody typing into the editor — pure,
// Type-1 testable, no database and no DOM.
//
// Two things produce a plan: the script language (packScript.js) and the
// Management issue converter (management/utils/issueDossierPlan.js). One
// function applies it (packBuild.js). Keeping the plan as plain data between
// them is what stops the script, the converter and the builder each carrying
// their own idea of what a pack contains.
//
// ── Shape (version 1) ────────────────────────────────────────────────────────
//   {
//     version: 1,
//     title, description?,
//     folders: [ ['Evidence', 'Photos'], … ]          file-tree folders (paths of names)
//     files:   [ { name, ref, folder: [..], description?,
//                  source: { kind: 'upload' }                      — bytes supplied by the caller, matched by `name`
//                        | { kind: 'library', documentId } } ],    — an existing document_library row to copy
//     pages:   [ { path: ['Chapter', 'Sub'], blocks: [Block…] } ], parents are implied, in order
//     tables:  [ { template, title, rows: [ { fields, file?, page? } ] } ],
//   }
//   Block = { type: 'heading', level: 1|2|3, text }
//         | { type: 'html', html }                                      already-written rich text (an issue's comments)
//         | { type: 'text', markdown } | { type: 'text', from }       `from` is a file name, resolved by fillTextFiles
//         | { type: 'image', file, width? } | { type: 'attachment', file }
//         | { type: 'callout', variant, markdown }
//         | { type: 'toggle', summary, markdown, open }
//         | { type: 'embedPage', path, mode? } | { type: 'embedTable', title }
//
// `file` in a block or row is a file's `ref` (its alias, or its name).
//
// Publishing and templates are deliberately NOT part of a plan: a plan only
// builds a private working pack, and what is published is the author's decision.

import { TEMPLATE_KEYS, fieldsFor } from './datasetTemplates.js';
import { CALLOUT_VARIANTS } from './calloutNode.js';
import { EMBED_MODES } from './embedGuard.js';
import { IMAGE_WIDTHS } from './assetPreview.js';
import { MAX_DEPTH } from './docTree.js';
import { MAX_FOLDER_DEPTH } from './fileTree.js';

export const PLAN_VERSION = 1;
export const HEADING_LEVELS = [1, 2, 3];
export const MAX_PLAN_PAGES = 300;
export const MAX_PLAN_FILES = 200;

export const BLOCK_TYPES = ['heading', 'text', 'html', 'image', 'attachment', 'callout', 'toggle', 'embedPage', 'embedTable'];

/** A new, empty plan. */
export function emptyPlan(title = 'Untitled pack') {
  return { version: PLAN_VERSION, title, description: null, folders: [], files: [], pages: [], tables: [] };
}

/** "A/B/C" → ['A','B','C'] (empty segments dropped). An array is returned cleaned. */
export function splitPath(path) {
  const parts = Array.isArray(path) ? path : String(path ?? '').split('/');
  return parts.map(p => String(p ?? '').trim()).filter(Boolean);
}

export const pathKey = (path) => splitPath(path).map(p => p.toLowerCase()).join('/');
export const pathLabel = (path) => splitPath(path).join(' / ');

/** The file a block or row names, by ref (case-insensitive), or null. */
export function findFile(plan, ref) {
  const r = String(ref ?? '').trim().toLowerCase();
  if (!r) return null;
  return plan.files.find(f => f.ref.toLowerCase() === r)
      ?? plan.files.find(f => f.name.toLowerCase() === r)
      ?? null;
}

export const findPage = (plan, path) => {
  const k = pathKey(path);
  return plan.pages.find(p => pathKey(p.path) === k) ?? null;
};

export const findTable = (plan, title) => {
  const t = String(title ?? '').trim().toLowerCase();
  return plan.tables.find(x => x.title.trim().toLowerCase() === t) ?? null;
};

/** Every folder a plan needs, each ancestor before its children, no repeats. */
export function allFolderPaths(plan) {
  const seen = new Set();
  const out = [];
  const add = (path) => {
    const parts = splitPath(path);
    for (let i = 1; i <= parts.length; i++) {
      const sub = parts.slice(0, i);
      const k = pathKey(sub);
      if (!seen.has(k)) { seen.add(k); out.push(sub); }
    }
  };
  for (const f of plan.folders ?? []) add(f);
  for (const f of plan.files ?? []) add(f.folder);
  return out;
}

/** Every page a plan needs, each ancestor first. Pages named only as a parent get a title-only entry. */
export function allPagePaths(plan) {
  const seen = new Set();
  const out = [];
  for (const page of plan.pages) {
    const parts = splitPath(page.path);
    for (let i = 1; i <= parts.length; i++) {
      const sub = parts.slice(0, i);
      const k = pathKey(sub);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ path: sub, page: i === parts.length ? page : null });
    }
  }
  return out;
}

/**
 * Everything wrong with a plan, as sentences a person can act on. [] = fine.
 * @param {any} plan
 * @returns {string[]}
 */
export function planProblems(plan) {
  const problems = [];
  if (!plan || typeof plan !== 'object') return ['There is no plan.'];
  if (!String(plan.title ?? '').trim()) problems.push('The pack needs a title.');

  const pages = allPagePaths(plan);
  if (pages.length > MAX_PLAN_PAGES) problems.push(`A pack made this way is limited to ${MAX_PLAN_PAGES} pages (this has ${pages.length}).`);
  if ((plan.files ?? []).length > MAX_PLAN_FILES) problems.push(`A pack made this way is limited to ${MAX_PLAN_FILES} files.`);

  const seenPages = new Set();
  for (const page of plan.pages) {
    const parts = splitPath(page.path);
    if (!parts.length) { problems.push('A page has no title.'); continue; }
    if (parts.length > MAX_DEPTH) problems.push(`Page "${pathLabel(parts)}" is nested ${parts.length} deep; pages go ${MAX_DEPTH} deep at most.`);
    const k = pathKey(parts);
    if (seenPages.has(k)) problems.push(`Page "${pathLabel(parts)}" is defined twice.`);
    seenPages.add(k);
  }

  for (const folder of allFolderPaths(plan)) {
    if (folder.length > MAX_FOLDER_DEPTH) problems.push(`Folder "${pathLabel(folder)}" is nested ${folder.length} deep; folders go ${MAX_FOLDER_DEPTH} deep at most.`);
  }

  const refs = new Set();
  for (const f of plan.files ?? []) {
    if (!String(f.name ?? '').trim()) problems.push('A file has no name.');
    const k = String(f.ref ?? '').toLowerCase();
    if (refs.has(k)) problems.push(`Two files are called "${f.ref}"; give one an alias.`);
    refs.add(k);
    if (f.source?.kind === 'library' && !f.source.documentId) problems.push(`File "${f.name}" names no stored document.`);
  }

  const titles = new Set();
  for (const t of plan.tables ?? []) {
    if (!TEMPLATE_KEYS.includes(t.template)) problems.push(`Table "${t.title}" uses an unknown kind "${t.template}" (use ${TEMPLATE_KEYS.join(', ')}).`);
    const k = String(t.title ?? '').trim().toLowerCase();
    if (!k) problems.push('A table has no title.');
    if (titles.has(k)) problems.push(`Two tables are called "${t.title}".`);
    titles.add(k);
    const known = new Set(fieldsFor(t.template).map(f => f.key));
    for (const [i, row] of (t.rows ?? []).entries()) {
      for (const key of Object.keys(row.fields ?? {})) {
        if (!known.has(key)) problems.push(`Table "${t.title}" row ${i + 1}: "${key}" is not a column (use ${[...known].join(', ')}).`);
      }
      if (row.file && !findFile(plan, row.file)) problems.push(`Table "${t.title}" row ${i + 1} names the file "${row.file}", which is not in the pack.`);
      if (row.page && !pages.some(p => pathKey(p.path) === pathKey(row.page))) problems.push(`Table "${t.title}" row ${i + 1} names the page "${row.page}", which is not in the pack.`);
    }
  }

  for (const page of plan.pages) {
    const where = `Page "${pathLabel(page.path)}"`;
    for (const [i, b] of (page.blocks ?? []).entries()) {
      const at = `${where}, block ${i + 1}`;
      if (!BLOCK_TYPES.includes(b?.type)) { problems.push(`${at}: unknown block type "${b?.type}".`); continue; }
      if (b.type === 'heading' && !HEADING_LEVELS.includes(b.level)) problems.push(`${at}: heading levels are ${HEADING_LEVELS.join(', ')}.`);
      if ((b.type === 'image' || b.type === 'attachment') && !findFile(plan, b.file)) problems.push(`${at}: the file "${b.file}" is not in the pack (add it with a FILE line).`);
      if (b.type === 'image' && b.width && !IMAGE_WIDTHS.includes(b.width)) problems.push(`${at}: picture sizes are ${IMAGE_WIDTHS.join(', ')}.`);
      if (b.type === 'callout' && !CALLOUT_VARIANTS.some(v => v.value === b.variant)) problems.push(`${at}: callout kinds are ${CALLOUT_VARIANTS.map(v => v.value).join(', ')}.`);
      if (b.type === 'text' && b.from && b.markdown == null) problems.push(`${at}: the text file "${b.from}" has not been supplied.`);
      if (b.type === 'embedPage') {
        if (!pages.some(p => pathKey(p.path) === pathKey(b.path))) problems.push(`${at}: the page "${pathLabel(b.path)}" to show here is not in the pack.`);
        if (b.mode && !EMBED_MODES.includes(b.mode)) problems.push(`${at}: show modes are ${EMBED_MODES.join(', ')}.`);
      }
      if (b.type === 'embedTable' && !findTable(plan, b.title)) problems.push(`${at}: the table "${b.title}" is not in the pack.`);
    }
  }
  return problems;
}

/** Text blocks that read their words from a file: the file names still needed. */
export function textFilesNeeded(plan) {
  const names = new Set();
  for (const page of plan.pages) for (const b of page.blocks ?? []) {
    if (b.type === 'text' && b.from && b.markdown == null) names.add(b.from);
  }
  return [...names];
}

/**
 * Fill `TEXT FROM` blocks from file contents. Returns a new plan; names are matched ignoring case.
 * @param {any} plan
 * @param {Record<string,string>} contents file name → text
 */
export function fillTextFiles(plan, contents) {
  const byName = new Map(Object.entries(contents ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ...plan,
    pages: plan.pages.map(p => ({
      ...p,
      blocks: (p.blocks ?? []).map(b =>
        b.type === 'text' && b.from && b.markdown == null && byName.has(b.from.toLowerCase())
          ? { ...b, markdown: byName.get(b.from.toLowerCase()) } : b),
    })),
  };
}

/** Uploaded files still to be supplied: names of files whose bytes the caller must provide. */
export function uploadsNeeded(plan) {
  return (plan.files ?? []).filter(f => f.source?.kind === 'upload').map(f => f.name);
}

/** What applying a plan will make — for the preview. */
export function describePlan(plan) {
  const pages = allPagePaths(plan).length;
  const files = (plan.files ?? []).length;
  return {
    pages,
    folders: allFolderPaths(plan).length,
    files,
    tables: (plan.tables ?? []).length,
    rows: (plan.tables ?? []).reduce((n, t) => n + (t.rows ?? []).length, 0),
    blocks: plan.pages.reduce((n, p) => n + (p.blocks ?? []).length, 0),
  };
}
