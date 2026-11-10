// src/lib/apps/dossier/utils/packUpdate.js
// Updating a pack from where it was made (a Management issue) WITHOUT LOSING
// ANYTHING written in it (user, 2026-11-10).
//
// The pack remembers what it copied: dossier_source_items maps each `key` of the
// plan (packPlan.js — 'activity:<id>', 'chronology:action:<id>', 'document:<id>',
// 'summary'…) to the page, table, row or file it became, with a fingerprint of the
// plan item (source_hash) and, for a page, of the page as written (written_hash).
// A fresh plan from the issue is compared with that record:
//
//   new on the issue                → ADDED (pages, rows, tables, files)
//   an OVERVIEW page (no ':' in its key — Summary, Activity, Actions, Meetings)
//     that changed and was not edited here → REFRESHED by itself
//   an overview page that changed and WAS edited here → offered, the person chooses
//   an activity page that changed on the issue → offered, the person chooses
//   gone from the issue             → listed, LEFT in the pack
//   removed from the pack here      → listed, not added back
//
// ⛔ Nothing is ever deleted, and a table row is never changed (a row has no
// versions, so a changed row could not be put back). Every page that is replaced
// is saved to its History first ("Before update from Issue 49 …"), which is how an
// update is rolled back — the page's own History → Restore.
//
// Pure: everything outside comes in through `deps`, as packBuild.js does.

import { newUuid } from '#lib/utils/uuid.js';
import { uniqueSlug } from './slug.js';
import { extractLinks } from './docLinks.js';
import { coerceRecordFields } from './datasetTemplates.js';
import { desiredFolderPath } from './fileSync.js';
import { pageBlocksJson } from './planBlocks.js';
import { allPagePaths, pathKey, pathLabel, findFile, splitPath } from './packPlan.js';

const IMPORT_BATCH = 10;

/** What a remembered item became (dossier_source_items.target_kind, migration 291). */
export const TARGET_KINDS = ['page', 'record', 'table', 'file'];

// ── Fingerprints ─────────────────────────────────────────────────────────────

/** JSON with object keys sorted, so the same data always gives the same text. */
export function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().filter(k => value[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** A short fingerprint of a string (FNV-1a, 64 bits as hex). Not for security. */
export function fingerprint(text) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const ch of String(text)) {
    h ^= BigInt(ch.codePointAt(0) ?? 0);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** What a plan item says, fingerprinted. Titles of pages are left out: an
 *  activity page's number moves when an earlier entry is added, which is not a change. */
export function planItemHash(kind, item) {
  switch (kind) {
    case 'page':   return fingerprint(stableStringify(item.blocks ?? []));
    case 'record': return fingerprint(stableStringify({ fields: item.fields, page: item.page ?? null, file: item.file ?? null }));
    case 'table':  return fingerprint(stableStringify({ template: item.template, title: item.title }));
    case 'file':   return fingerprint(stableStringify({ name: item.name, description: item.description ?? null, source: item.source }));
    default:       return null;
  }
}

/** A page's stored content, fingerprinted with the block ids taken out (they are
 *  random, and the editor adds them), so "edited here" means a real change. */
export function pageContentHash(blocks) {
  const strip = (node) => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'attrs' && v && typeof v === 'object') {
        const { uid, ...rest } = v;
        if (Object.keys(rest).length) out.attrs = strip(rest);
      } else out[k] = strip(v);
    }
    return out;
  };
  return fingerprint(stableStringify(strip(blocks ?? null)));
}

/** An overview page is one the whole issue feeds (Summary, Actions…), not one item. */
export const isOverviewKey = (key) => !String(key).includes(':');

// ── What an update would do ──────────────────────────────────────────────────

/**
 * @param {any} plan  a fresh plan from the source
 * @param {{ items: any[], docs: any[], datasets: any[], records: any[], files: any[] }} pack
 * @returns {{
 *   addPages: any[], addTables: any[], addRows: { table: any, row: any }[], addFiles: any[],
 *   refresh: { page: any, doc: any, item: any }[],
 *   choose:  { page: any, doc: any, item: any, why: 'changed'|'edited', editedHere: boolean }[],
 *   removed: { key: string, label: string }[],
 *   removedHere: { key: string, label: string }[],
 *   nothing: boolean,
 * }}
 */
export function planUpdate(plan, { items = [], docs = [], datasets = [], records = [], files = [] }) {
  const byKey = new Map(items.map(i => [i.source_key, i]));
  const docById = new Map(docs.map(d => [d.id, d]));
  /** @type {{ addPages: any[], addTables: any[], addRows: any[], addFiles: any[], refresh: any[], choose: any[], removed: any[], removedHere: any[] }} */
  const out = { addPages: [], addTables: [], addRows: [], addFiles: [], refresh: [], choose: [], removed: [], removedHere: [] };
  const exists = (item) => item.target_kind === 'page' ? docById.has(item.target_id)
    : item.target_kind === 'table' ? datasets.some(d => d.id === item.target_id)
    : item.target_kind === 'record' ? records.some(r => r.id === item.target_id)
    : files.some(f => f.id === item.target_id);
  const seen = new Set();

  for (const page of plan.pages ?? []) {
    if (!page.key) continue;
    seen.add(page.key);
    const item = byKey.get(page.key);
    if (!item) { out.addPages.push(page); continue; }
    const doc = docById.get(item.target_id);
    if (!doc) { out.removedHere.push({ key: page.key, label: pathLabel(page.path) }); continue; }
    if (planItemHash('page', page) === item.source_hash) continue;
    const editedHere = item.written_hash != null && pageContentHash(doc.blocks) !== item.written_hash;
    if (isOverviewKey(page.key)) {
      if (editedHere) out.choose.push({ page, doc, item, why: 'edited', editedHere });
      else out.refresh.push({ page, doc, item });
    } else {
      out.choose.push({ page, doc, item, why: 'changed', editedHere });
    }
  }

  for (const table of plan.tables ?? []) {
    let tableGone = false;
    if (table.key) {
      seen.add(table.key);
      const item = byKey.get(table.key);
      if (!item) {
        // A table of that name made here is used rather than a second one.
        if (!datasets.some(d => d.title.trim().toLowerCase() === table.title.trim().toLowerCase())) out.addTables.push(table);
      } else if (!exists(item)) {
        tableGone = true;
        out.removedHere.push({ key: table.key, label: `the ${table.title} table` });
      }
    }
    for (const row of table.rows ?? []) {
      if (!row.key) continue;
      seen.add(row.key);
      const item = byKey.get(row.key);
      if (!item) { if (!tableGone) out.addRows.push({ table, row }); }
      // A recorded row is never changed, and one removed here is not put back.
    }
  }

  for (const file of plan.files ?? []) {
    if (!file.key) continue;
    seen.add(file.key);
    const item = byKey.get(file.key);
    if (!item) out.addFiles.push(file);
    else if (!exists(item)) out.removedHere.push({ key: file.key, label: file.name });
  }

  for (const item of items) {
    if (seen.has(item.source_key) || !exists(item)) continue;
    out.removed.push({ key: item.source_key, label: describeTarget(item, { docById, datasets, records, files }) });
  }

  const nothing = !(out.addPages.length || out.addTables.length || out.addRows.length || out.addFiles.length
    || out.refresh.length || out.choose.length);
  return { ...out, nothing };
}

function describeTarget(item, { docById, datasets, records, files }) {
  if (item.target_kind === 'page') return docById.get(item.target_id)?.title ?? 'A page';
  if (item.target_kind === 'table') return datasets.find(d => d.id === item.target_id)?.title ?? 'A table';
  if (item.target_kind === 'file') {
    const f = files.find(x => x.id === item.target_id);
    return f?.display_name || f?.filename || 'A file';
  }
  const r = records.find(x => x.id === item.target_id);
  const table = datasets.find(d => d.id === r?.dataset_id)?.title ?? 'a table';
  const words = r ? String(r.fields?.event ?? r.fields?.subject ?? r.fields?.name ?? '').trim() : '';
  return `A row of ${table}${words ? `: ${words.slice(0, 80)}` : ''}`;
}

/** One line per part, for the screen. */
export function describeUpdate(report) {
  const n = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : null);
  return [
    n(report.addPages.length, 'new page', 'new pages'),
    n(report.addRows.length, 'new table row', 'new table rows'),
    n(report.addFiles.length, 'new file', 'new files'),
    n(report.addTables.length, 'new table', 'new tables'),
    n(report.refresh.length, 'page refreshed', 'pages refreshed'),
  ].filter(Boolean);
}

// ── Doing it ─────────────────────────────────────────────────────────────────

/**
 * `choose`: the keys of the offered pages the person chose to replace.
 * @param {{ pack: any, plan: any, report: ReturnType<typeof planUpdate>,
 *           choose: Set<string>,
 *           userId: string, label: string,
 *           existing: { items: any[], docs: any[], datasets: any[], records: any[], files: any[], folders: any[] },
 *           htmlToNodes: (html: string) => object[] }} opts
 * @param {{ createMany: (table: string, rows: object[]) => Promise<any>,
 *           saveItems: (rows: object[]) => Promise<any>,
 *           saveDocBlocks: (id: string, blocks: object, summary: string) => Promise<any>,
 *           importDocuments: (packId: string, items: object[]) => Promise<{ map: Record<string, object>, skipped: any[] }>,
 *           stamp: (userId: string) => object, mint?: () => string }} deps
 */
export async function applyPlanUpdate(opts, deps) {
  const { pack, plan, report, userId, label, existing, htmlToNodes } = opts;
  const mint = deps.mint ?? newUuid;
  const chosen = opts.choose ?? new Set();
  const itemByKey = new Map(existing.items.map(i => [i.source_key, i]));
  const docById = new Map(existing.docs.map(d => [d.id, d]));
  /** @type {{ name: string, reason: string }[]} */
  const skipped = [];
  const counts = { pages: 0, rows: 0, files: 0, tables: 0, replaced: 0 };
  /** @param {string} key @param {string} kind @param {string} id @param {string|null} sourceHash @param {string|null} [writtenHash] */
  const itemRow = (key, kind, id, sourceHash, writtenHash = null) => ({
    pack_id: pack.id, source_key: key, target_kind: kind, target_id: id,
    source_hash: sourceHash, written_hash: writtenHash, created_by: userId, updated_at: new Date().toISOString(),
  });

  // ── Files: copied in, into the folder the plan names (made if missing) ──────
  const folders = [...existing.folders];
  const folderFor = async (path) => {
    let parent = null;
    for (const name of splitPath(path)) {
      let f = folders.find(x => (x.parent_id ?? null) === parent && x.name.trim().toLowerCase() === name.toLowerCase());
      if (!f) {
        f = { id: mint(), pack_id: pack.id, parent_id: parent, name, order_index: folders.filter(x => (x.parent_id ?? null) === parent).length };
        await deps.createMany('dossier_folders', [{ ...f, created_by: userId, ...deps.stamp(userId) }]);
        folders.push(f);
      }
      parent = f.id;
    }
    return parent;
  };

  /** lower-case ref → document row, for blocks and rows */
  const fileDocs = new Map();
  for (const f of plan.files ?? []) {
    const item = f.key ? itemByKey.get(f.key) : null;
    const doc = item && existing.files.find(x => x.id === item.target_id);
    if (doc) fileDocs.set(f.ref.toLowerCase(), doc);
  }
  for (let i = 0; i < report.addFiles.length; i += IMPORT_BATCH) {
    const batch = report.addFiles.slice(i, i + IMPORT_BATCH);
    const folderIds = [];
    for (const f of batch) folderIds.push(await folderFor(f.folder));
    try {
      const result = await deps.importDocuments(pack.id, batch.map((f, j) => ({
        documentId: f.source.documentId, folderPath: desiredFolderPath(pack, folders, folderIds[j]), description: f.description ?? null,
      })));
      const made = [];
      const placements = [];
      batch.forEach((f, j) => {
        const doc = result.map?.[f.source.documentId];
        if (!doc) { skipped.push({ name: f.name, reason: result.skipped?.find(s => s.documentId === f.source.documentId)?.reason ?? 'it was not copied' }); return; }
        fileDocs.set(f.ref.toLowerCase(), doc);
        made.push(itemRow(f.key, 'file', doc.id, planItemHash('file', f)));
        if (folderIds[j]) placements.push({ document_id: doc.id, pack_id: pack.id, folder_id: folderIds[j], created_by: userId });
        counts.files += 1;
      });
      if (placements.length) await deps.createMany('dossier_file_placements', placements);
      if (made.length) await deps.saveItems(made);
    } catch (err) {
      for (const f of batch) skipped.push({ name: f.name, reason: String(/** @type {any} */ (err)?.message ?? err) });
    }
  }

  // ── Tables ────────────────────────────────────────────────────────────────
  const tables = new Map();                  // lower-case title → { id, title }
  for (const t of plan.tables ?? []) {
    const item = t.key ? itemByKey.get(t.key) : null;
    const ds = (item && existing.datasets.find(d => d.id === item.target_id))
      ?? existing.datasets.find(d => d.title.trim().toLowerCase() === t.title.trim().toLowerCase());
    if (ds) tables.set(t.title.trim().toLowerCase(), { id: ds.id, title: ds.title, existed: true, key: t.key, item });
  }
  const newTables = report.addTables.map(t => ({ id: mint(), pack_id: pack.id, key: t.template, title: t.title, _plan: t }));
  for (const t of newTables) tables.set(t.title.trim().toLowerCase(), { id: t.id, title: t.title });
  if (newTables.length) {
    await deps.createMany('dossier_datasets', newTables.map(({ _plan, ...d }) => ({ ...d, created_by: userId, ...deps.stamp(userId) })));
    await deps.saveItems(newTables.map(t => itemRow(t._plan.key, 'table', t.id, planItemHash('table', t._plan))));
    counts.tables = newTables.length;
  }
  // A table used by name (made here before) is now remembered too.
  const adopted = (plan.tables ?? []).filter(t => t.key && !itemByKey.has(t.key) && tables.get(t.title.trim().toLowerCase())?.existed);
  if (adopted.length) await deps.saveItems(adopted.map(t => itemRow(t.key, 'table', tables.get(t.title.trim().toLowerCase()).id, planItemHash('table', t))));

  // ── Pages: ids for every page the plan names ──────────────────────────────
  const pages = new Map();                   // pathKey → { id, slug, title }
  const takenSlugs = existing.docs.map(d => d.slug);
  for (const e of allPagePaths(plan)) {
    const p = e.page;
    const item = p?.key ? itemByKey.get(p.key) : null;
    const doc = item ? docById.get(item.target_id) : null;
    if (doc) pages.set(pathKey(e.path), { id: doc.id, slug: doc.slug, title: doc.title });
  }
  const newPages = report.addPages.map((p) => {
    const title = splitPath(p.path).slice(-1)[0];
    const slug = uniqueSlug(title, takenSlugs);
    takenSlugs.push(slug);
    const me = { id: mint(), slug, title };
    pages.set(pathKey(p.path), me);
    return { plan: p, ...me };
  });

  const ctx = { htmlToNodes, files: fileDocs, pages, tables, plan, mint };

  // ── New pages, each under its parent where that is still in the pack ──────
  if (newPages.length) {
    const childCount = new Map();
    const nextOrder = (parentId) => {
      if (!childCount.has(parentId)) {
        childCount.set(parentId, existing.docs.filter(d => (d.parent_doc_id ?? null) === parentId)
          .reduce((m, d) => Math.max(m, (d.order_index ?? 0) + 1), 0));
      }
      const n = childCount.get(parentId);
      childCount.set(parentId, n + 1);
      return n;
    };
    const rows = newPages.map((np) => {
      const parts = splitPath(np.plan.path);
      const parentId = parts.length > 1 ? (pages.get(pathKey(parts.slice(0, -1)))?.id ?? null) : null;
      return {
        id: np.id, pack_id: pack.id, parent_doc_id: parentId, slug: np.slug, title: np.title, icon: null,
        order_index: nextOrder(parentId), blocks: pageBlocksJson(np.plan, ctx),
      };
    });
    await deps.createMany('dossier_docs', rows.map(d => ({ ...d, created_by: userId, ...deps.stamp(userId) })));
    await deps.saveItems(rows.map((d, i) => itemRow(newPages[i].plan.key, 'page', d.id, planItemHash('page', newPages[i].plan), pageContentHash(d.blocks))));
    const links = rows.flatMap(d => extractLinks(d.blocks).map(l => ({ ...l, pack_id: pack.id, from_doc_id: d.id, created_by: userId })));
    if (links.length) await deps.createMany('dossier_links', links).catch(() => {});
    counts.pages = rows.length;
  }

  // ── Rows, added at the end of their table ─────────────────────────────────
  if (report.addRows.length) {
    const nextPos = new Map();
    const rows = [];
    const made = [];
    for (const { table, row } of report.addRows) {
      const t = tables.get(table.title.trim().toLowerCase());
      if (!t) { skipped.push({ name: `a ${table.title} row`, reason: 'the table is not in the pack' }); continue; }
      if (!nextPos.has(t.id)) {
        nextPos.set(t.id, existing.records.filter(r => r.dataset_id === t.id).reduce((m, r) => Math.max(m, (r.position ?? 0) + 1), 0));
      }
      const id = mint();
      const position = nextPos.get(t.id);
      nextPos.set(t.id, position + 1);
      rows.push({
        id, dataset_id: t.id, fields: coerceRecordFields(table.template, row.fields), position,
        document_id: row.file ? (fileDocs.get(findFile(plan, row.file)?.ref.toLowerCase())?.id ?? null) : null,
        doc_id: row.page ? (pages.get(pathKey(row.page))?.id ?? null) : null,
      });
      made.push(itemRow(row.key, 'record', id, planItemHash('record', row)));
    }
    if (rows.length) {
      await deps.createMany('dossier_records', rows.map(r => ({ ...r, created_by: userId, ...deps.stamp(userId) })));
      await deps.saveItems(made);
      counts.rows = rows.length;
    }
  }

  // ── Pages replaced: saved to History first, then rewritten ────────────────
  const replace = [...report.refresh, ...report.choose.filter(c => chosen.has(c.page.key))];
  for (const { page, doc, item } of replace) {
    const blocks = pageBlocksJson(page, ctx);
    await deps.saveDocBlocks(doc.id, blocks, `Before update from ${label}`);
    await deps.saveItems([{ ...itemRow(page.key, 'page', doc.id, planItemHash('page', page), pageContentHash(blocks)), id: item.id }]);
    counts.replaced += 1;
  }

  return { counts, skipped };
}
