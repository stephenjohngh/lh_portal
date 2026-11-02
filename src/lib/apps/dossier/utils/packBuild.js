// src/lib/apps/dossier/utils/packBuild.js
// Applying a plan (packPlan.js): make the pack, its folders, files, pages and
// tables. Every outside effect comes in through `deps`, so the ordering and the
// failure handling are testable without a database or a browser.
//
// ── Order, and why ───────────────────────────────────────────────────────────
// Ids are minted before anything is inserted (as a duplicate does), because a
// page can show a page or a table that is built later. Files go first — the slow
// part, and the part pages refer to — then folders and placements, pages, tables
// and rows, then the link index. A file that cannot be stored does not stop the
// pack: it is reported, and the block that wanted it says so, as a duplicate does.
// Any other failure archives the half-made pack and renames it, never leaving it
// looking finished.

import { newUuid } from '#lib/utils/uuid.js';
import { errMessage } from '#lib/utils/errors.js';
import { uniqueSlug } from './slug.js';
import { extractLinks } from './docLinks.js';
import { coerceRecordFields } from './datasetTemplates.js';
import { desiredFolderPath } from './fileSync.js';
import { pageBlocksJson } from './planBlocks.js';
import {
  planProblems, allFolderPaths, allPagePaths, pathKey, findFile, findPage, splitPath,
  uploadsNeeded,
} from './packPlan.js';

const IMPORT_BATCH = 10;

/**
 * @param {any} plan
 * @param {{ userId: string, folderId?: string|null,
 *           uploads?: Record<string, File>,         file name → bytes (matched ignoring case)
 *           htmlToNodes: (html: string) => object[] }} opts
 * @param {{ createPack: Function, setArchived: Function, renamePack: Function,
 *           createMany: (table: string, rows: object[]) => Promise<any>,
 *           uploadFile: (file: File, meta: object) => Promise<object>,
 *           importDocuments: (packId: string, items: object[]) => Promise<{ map: Record<string, object>, skipped: any[] }>,
 *           stamp: (userId: string) => object,
 *           mint?: () => string }} deps
 */
export async function buildPackFromPlan(plan, opts, deps) {
  const { userId, folderId = null, htmlToNodes } = opts;
  const mint = deps.mint ?? newUuid;
  const uploads = new Map(Object.entries(opts.uploads ?? {}).map(([k, v]) => [k.toLowerCase(), v]));

  const problems = planProblems(plan);
  if (problems.length) throw new Error(problems[0] + (problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''));
  const missingUploads = uploadsNeeded(plan).filter(n => !uploads.has(n.toLowerCase()));
  if (missingUploads.length) throw new Error(`These files have not been supplied: ${missingUploads.join(', ')}.`);

  const pack = await deps.createPack({ title: plan.title, description: plan.description ?? null, folder_id: folderId }, userId);
  /** @type {{ ref?: string, name: string, reason: string }[]} */
  const skipped = [];

  try {
    // ── Folders ──────────────────────────────────────────────────────────────
    const folderIds = new Map();                // pathKey → id
    const siblingCount = new Map();             // parent key → n
    const folderRows = allFolderPaths(plan).map((path) => {
      const parentKey = pathKey(path.slice(0, -1));
      const order = siblingCount.get(parentKey) ?? 0;
      siblingCount.set(parentKey, order + 1);
      const id = mint();
      folderIds.set(pathKey(path), id);
      return {
        id, pack_id: pack.id, parent_id: path.length > 1 ? folderIds.get(parentKey) : null,
        name: path[path.length - 1], order_index: order,
      };
    });
    if (folderRows.length) {
      await deps.createMany('dossier_folders', folderRows.map(r => ({ ...r, created_by: userId, ...deps.stamp(userId) })));
    }

    // ── Files ────────────────────────────────────────────────────────────────
    /** lower-case ref → stored document row */
    const fileDocs = new Map();
    const folderOf = (f) => (splitPath(f.folder).length ? folderIds.get(pathKey(f.folder)) ?? null : null);
    const pathFor = (f) => desiredFolderPath(pack, folderRows, folderOf(f));

    for (const f of plan.files.filter(x => x.source?.kind === 'upload')) {
      try {
        const doc = await deps.uploadFile(uploads.get(f.name.toLowerCase()), {
          entity_type: 'dossier_pack', entity_id: pack.id, display_name: f.name,
          folder_path: pathFor(f), description: f.description || undefined,
        });
        fileDocs.set(f.ref.toLowerCase(), doc);
      } catch (err) {
        skipped.push({ ref: f.ref, name: f.name, reason: errMessage(err) });
      }
    }

    const libraryFiles = plan.files.filter(x => x.source?.kind === 'library');
    for (let i = 0; i < libraryFiles.length; i += IMPORT_BATCH) {
      const batch = libraryFiles.slice(i, i + IMPORT_BATCH);
      try {
        const result = await deps.importDocuments(pack.id, batch.map(f => ({
          documentId: f.source.documentId, folderPath: pathFor(f), description: f.description ?? null,
        })));
        for (const f of batch) {
          const doc = result.map?.[f.source.documentId];
          if (doc) fileDocs.set(f.ref.toLowerCase(), doc);
          else skipped.push({ ref: f.ref, name: f.name, reason: result.skipped?.find(s => s.documentId === f.source.documentId)?.reason ?? 'it was not copied' });
        }
      } catch (err) {
        for (const f of batch) skipped.push({ ref: f.ref, name: f.name, reason: errMessage(err) });
      }
    }

    const placements = plan.files
      .filter(f => fileDocs.has(f.ref.toLowerCase()) && folderOf(f))
      .map(f => ({ document_id: fileDocs.get(f.ref.toLowerCase()).id, pack_id: pack.id, folder_id: folderOf(f), created_by: userId }));
    if (placements.length) await deps.createMany('dossier_file_placements', placements);

    // ── Pages and tables: ids first ──────────────────────────────────────────
    const pageEntries = allPagePaths(plan);
    const takenSlugs = [];
    const pages = new Map();                    // pathKey → { id, slug, title }
    for (const e of pageEntries) {
      const title = e.path[e.path.length - 1];
      const slug = uniqueSlug(title, takenSlugs);
      takenSlugs.push(slug);
      pages.set(pathKey(e.path), { id: mint(), slug, title });
    }
    const tables = new Map();                   // lower-case title → { id, title }
    for (const t of plan.tables) tables.set(t.title.trim().toLowerCase(), { id: mint(), title: t.title });

    const ctx = { htmlToNodes, files: fileDocs, pages, tables, plan, mint };

    // ── Pages ────────────────────────────────────────────────────────────────
    const childCount = new Map();
    const docRows = pageEntries.map((e) => {
      const me = pages.get(pathKey(e.path));
      const parentKey = pathKey(e.path.slice(0, -1));
      const order = childCount.get(parentKey) ?? 0;
      childCount.set(parentKey, order + 1);
      return {
        id: me.id, pack_id: pack.id,
        parent_doc_id: e.path.length > 1 ? pages.get(parentKey).id : null,
        slug: me.slug, title: me.title, icon: null, order_index: order,
        blocks: pageBlocksJson(e.page ?? findPage(plan, e.path), ctx),
      };
    });
    if (docRows.length) {
      await deps.createMany('dossier_docs', docRows.map(d => ({ ...d, created_by: userId, ...deps.stamp(userId) })));
    }

    // ── Tables and their rows ────────────────────────────────────────────────
    const datasetRows = plan.tables.map(t => ({
      id: tables.get(t.title.trim().toLowerCase()).id, pack_id: pack.id, key: t.template, title: t.title,
    }));
    if (datasetRows.length) {
      await deps.createMany('dossier_datasets', datasetRows.map(d => ({ ...d, created_by: userId, ...deps.stamp(userId) })));
    }
    const recordRows = plan.tables.flatMap((t) => t.rows.map((row, i) => ({
      id: mint(), dataset_id: tables.get(t.title.trim().toLowerCase()).id,
      fields: coerceRecordFields(t.template, row.fields), position: i,
      document_id: row.file ? (fileDocs.get(findFile(plan, row.file)?.ref.toLowerCase())?.id ?? null) : null,
      doc_id: row.page ? (pages.get(pathKey(row.page))?.id ?? null) : null,
    })));
    if (recordRows.length) {
      await deps.createMany('dossier_records', recordRows.map(r => ({ ...r, created_by: userId, ...deps.stamp(userId) })));
    }

    // The link index is derived (a save rebuilds it), but backlinks read the
    // table, so seed it now. A failure here costs nothing that a save will not repair.
    const linkRows = docRows.flatMap(doc => extractLinks(doc.blocks).map(link => ({
      ...link, pack_id: pack.id, from_doc_id: doc.id, created_by: userId,
    })));
    if (linkRows.length) await deps.createMany('dossier_links', linkRows).catch(() => {});

    return {
      pack,
      counts: { pages: docRows.length, folders: folderRows.length, files: fileDocs.size, tables: datasetRows.length, rows: recordRows.length },
      skipped,
    };
  } catch (err) {
    const title = `${plan.title} — incomplete`;
    await deps.setArchived(pack.id, true, userId).catch(() => {});
    await deps.renamePack(pack.id, title, userId).catch(() => {});
    throw new Error(`The pack could not be completed: ${errMessage(err)}. What was made has been archived — an admin can delete it.`);
  }
}
