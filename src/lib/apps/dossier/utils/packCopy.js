// src/lib/apps/dossier/utils/packCopy.js
// Duplicating a pack — the id rewriting, pure and Type-1 testable.
//
// ── Why this is not a row copy ───────────────────────────────────────────────
// A page's content is ProseMirror JSON, and that JSON CACHES ids: a docLink
// mark carries target_doc_id, an embedDoc node carries target_doc_id, an
// embedDataset node carries dataset_id, and an asset node carries both
// document_id and provider_file_id. Copy the rows verbatim and every one of
// those still points into the pack you copied FROM. The copy would open with a
// broken-reference panel full of entries, and its embedded tables would show
// the original's rows.
//
// So a duplicate is: mint new ids for everything first, build old→new maps,
// then rewrite the blocks through them. That ordering is why the store
// pre-generates uuids rather than letting the database default them — the map
// has to be complete before the first page is rewritten, because page A can
// link to page B that has not been inserted yet.
//
// ── Slugs are deliberately kept ──────────────────────────────────────────────
// dossier_docs_pack_slug_idx is (pack_id, slug), so a copied page keeps its
// slug without collision. That matters beyond tidiness: docLink and embedDoc
// carry `target_slug` alongside the id, so preserving slugs leaves a correct
// fallback even if an id somehow fails to map.
//
// ── uids are re-minted ───────────────────────────────────────────────────────
// blockId.js already holds the rule that a COPIED block must not keep its
// original's uid — two blocks sharing an id break every link that resolves by
// it. A duplicated pack is that same copy, at pack scale.

import { newUuid } from '$lib/utils/uuid';

/**
 * Node/mark types that carry an id needing rewriting. Kept explicit: a new
 * referencing node type added without a line here would copy its reference
 * verbatim and point the duplicate back at the original pack.
 */
const ASSET_NODE   = 'asset';
const EMBED_DOC    = 'embedDoc';
const EMBED_SET    = 'embedDataset';
const DOC_LINK     = 'docLink';

/**
 * Rewrite one page's blocks for its new pack.
 *
 * A reference with no entry in its map is EMPTIED rather than left pointing at
 * the source pack: a reference that dangles is honest and gets reported by the
 * broken-reference panel, whereas one silently reaching into another pack is
 * neither visible nor correct. The only case that arises in practice is a file
 * reference when the author chose not to copy the files.
 *
 * @param {object|null} blocks - dossier_docs.blocks (ProseMirror JSON)
 * @param {{ docs?: Map<string,string>,
 *           datasets?: Map<string,string>,
 *           files?: Map<string,{ id: string, provider_file_id?: string }> }} maps
 * @param {() => string} [mint] - id factory; injectable so tests are deterministic
 * @returns {{ blocks: object|null, dropped: { docs: number, datasets: number, files: number } }}
 */
export function remapBlocks(blocks, maps = {}, mint = newUuid) {
  const docMap  = maps.docs     ?? new Map();
  const setMap  = maps.datasets ?? new Map();
  const fileMap = maps.files    ?? new Map();
  const dropped = { docs: 0, datasets: 0, files: 0 };

  /** @param {any} node */
  const walk = (node) => {
    if (!node || typeof node !== 'object') return node;

    const out = { ...node };

    if (out.attrs) {
      const attrs = { ...out.attrs };

      // Every addressable block gets a fresh identity in the copy.
      if (attrs.uid) attrs.uid = mint();

      if (out.type === ASSET_NODE && attrs.document_id) {
        const target = fileMap.get(attrs.document_id);
        if (target) {
          attrs.document_id      = target.id;
          attrs.provider_file_id = target.provider_file_id ?? '';
        } else {
          attrs.document_id      = null;
          attrs.provider_file_id = '';
          // The cached spreadsheet preview is the source file's CONTENT, held
          // in the block. Leaving it would render the original's data in a pack
          // whose file was deliberately not copied — the one way this could
          // carry a previous matter's material into a new one.
          attrs.sheet_preview    = null;
          dropped.files++;
        }
      }

      if (out.type === EMBED_SET && attrs.dataset_id) {
        const id = setMap.get(attrs.dataset_id);
        if (id) attrs.dataset_id = id;
        else { attrs.dataset_id = null; dropped.datasets++; }
      }

      // embedDoc and docLink both keep target_slug untouched — it resolves
      // inside the new pack exactly as it did in the old one.
      if (out.type === EMBED_DOC && attrs.target_doc_id) {
        const id = docMap.get(attrs.target_doc_id);
        if (id) attrs.target_doc_id = id;
        else { attrs.target_doc_id = null; dropped.docs++; }
      }

      out.attrs = attrs;
    }

    if (Array.isArray(out.marks)) {
      out.marks = out.marks.map((mark) => {
        if (mark?.type !== DOC_LINK || !mark.attrs?.target_doc_id) return mark;
        const id = docMap.get(mark.attrs.target_doc_id);
        if (!id) dropped.docs++;
        return { ...mark, attrs: { ...mark.attrs, target_doc_id: id ?? null } };
      });
    }

    if (Array.isArray(out.content)) out.content = out.content.map(walk);
    return out;
  };

  return { blocks: blocks ? walk(blocks) : blocks, dropped };
}

/**
 * The whole plan for a duplicate: new ids for every row, and the pages already
 * rewritten. Pure — the store does the inserting.
 *
 * Records are included only when the author asked for them. A template made by
 * copying a real matter carries that matter's chronology and correspondence,
 * and those rows would otherwise ride into the next client's pack unnoticed.
 *
 * @param {object} source
 * @param {object[]} source.docs
 * @param {object[]} source.datasets
 * @param {object[]} source.records
 * @param {object} options
 * @param {string} options.packId - the new pack's id
 * @param {boolean} [options.includeRecords]
 * @param {Map<string,{ id: string, provider_file_id?: string }>} [options.files]
 *        source document_library id → the copy that replaces it
 * @param {() => string} [options.mint]
 */
export function planPackCopy(
  { docs = [], datasets = [], records = [] } = {},
  { packId, includeRecords = false, files = new Map(), mint = newUuid } = {},
) {
  // ── 1. Mint every id up front, so the maps are complete before any rewrite.
  const docMap = new Map(docs.map(d => [d.id, mint()]));
  const setMap = new Map(datasets.map(d => [d.id, mint()]));

  const dropped = { docs: 0, datasets: 0, files: 0 };

  // ── 2. Pages, with their blocks rewritten and their tree re-pointed.
  const newDocs = docs.map((doc) => {
    const result = remapBlocks(doc.blocks, { docs: docMap, datasets: setMap, files }, mint);
    dropped.docs     += result.dropped.docs;
    dropped.datasets += result.dropped.datasets;
    dropped.files    += result.dropped.files;

    return {
      id:      docMap.get(doc.id),
      pack_id: packId,
      // A parent outside this pack is impossible, but a null map entry would
      // silently orphan the page, so fall back to a root rather than to
      // whatever the source pointed at.
      parent_doc_id: doc.parent_doc_id ? (docMap.get(doc.parent_doc_id) ?? null) : null,
      slug:        doc.slug,
      title:       doc.title,
      icon:        doc.icon ?? null,
      order_index: doc.order_index ?? 0,
      blocks:      result.blocks ?? { type: 'doc', content: [] },
    };
  });

  // ── 3. Tables. Structure always; rows only if asked.
  const newDatasets = datasets.map(d => ({
    id:      setMap.get(d.id),
    pack_id: packId,
    key:     d.key,
    title:   d.title,
  }));

  const newRecords = includeRecords
    ? records
        .filter(r => setMap.has(r.dataset_id))
        .map((r) => {
          const file = r.document_id ? files.get(r.document_id) : null;
          if (r.document_id && !file) dropped.files++;
          return {
            id:         mint(),
            dataset_id: setMap.get(r.dataset_id),
            fields:     r.fields ?? {},
            position:   r.position ?? 0,
            // A row's evidence and its "detail is here" page are references
            // like any other, and rot the same way if they are not remapped.
            document_id: file?.id ?? null,
            doc_id:      r.doc_id ? (docMap.get(r.doc_id) ?? null) : null,
          };
        })
    : [];

  return { docs: newDocs, datasets: newDatasets, records: newRecords, docMap, setMap, dropped };
}

/**
 * A title that does not collide with one the author already has.
 *
 * @param {string} title
 * @param {string[]} [existing]
 */
export function copyTitle(title, existing = []) {
  const taken = new Set(existing.map(t => String(t ?? '').trim().toLowerCase()));
  const base  = `${String(title ?? 'Untitled pack').trim()} (copy)`;
  if (!taken.has(base.toLowerCase())) return base;

  for (let n = 2; n < 100; n++) {
    const candidate = `${String(title ?? 'Untitled pack').trim()} (copy ${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/**
 * What the author is about to get — plain counts, for the dialog.
 *
 * Phrased as what the COPY will contain rather than what will be copied: the
 * question in the author's mind is what a recipient of the new pack would see.
 *
 * @param {{ docs: object[], datasets: object[], records: object[], files: object[] }} source
 * @param {{ includeRecords: boolean, includeFiles: boolean }} options
 */
export function describePackCopy(source, { includeRecords, includeFiles } = {}) {
  const pages  = source?.docs?.length     ?? 0;
  const tables = source?.datasets?.length ?? 0;
  const rows   = source?.records?.length  ?? 0;
  const files  = source?.files?.length    ?? 0;

  const parts = [plural(pages, 'page'), plural(tables, 'table')];
  if (tables) {
    parts.push(includeRecords
      ? `${plural(rows, 'entry', 'entries')} in them`
      : 'with no entries');
  }
  if (files) parts.push(includeFiles ? plural(files, 'file') : 'no files');

  return `The copy will have ${parts.join(', ')}.`;
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
