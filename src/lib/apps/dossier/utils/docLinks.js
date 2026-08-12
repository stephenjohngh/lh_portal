// src/lib/apps/dossier/utils/docLinks.js
// Deriving the link graph from a page's blocks — pure, Type-1 testable.
//
// dossier_links is an INDEX over the blocks JSON, never a source of truth (see
// migration 174). Everything that decides what belongs in it lives here, so the
// store only has to persist a diff.
//
// The no-churn rule matters as much as the extraction: autosave fires
// constantly, and a page whose references have not changed must produce no
// database writes at all.

/** Marks and nodes that constitute a reference. */
const DOC_LINK_MARK = 'docLink';
const ASSET_NODE    = 'asset';
const EMBED_NODE    = 'embedDoc';

/**
 * Pull every reference out of a ProseMirror doc, in document order.
 *
 * `from_block_id` is the uid of the nearest enclosing addressable block, so a
 * backlink can point at the paragraph rather than just the page. Blocks carry
 * uids courtesy of the BlockId extension; anything we cannot attribute gets
 * null rather than being dropped.
 *
 * Duplicates are collapsed: the same target referenced twice from one block is
 * one row. Referenced from two different blocks, it is two — those are
 * genuinely different anchors.
 *
 * @param {object} blocks - dossier_docs.blocks
 * @returns {{from_block_id: string|null, target_kind: 'doc'|'asset',
 *            target_doc_id: string|null, target_doc_ref: string|null,
 *            target_document_id: string|null}[]}
 */
export function extractLinks(blocks) {
  /** @type {any[]} */
  const found = [];
  const seen = new Set();

  const push = (link) => {
    const key = linkKey(link);
    if (seen.has(key)) return;
    seen.add(key);
    found.push(link);
  };

  /**
   * @param {any} node
   * @param {string|null} blockUid - uid of the nearest addressable ancestor
   */
  const walk = (node, blockUid) => {
    if (!node || typeof node !== 'object') return;

    // A node carrying a uid becomes the anchor for everything beneath it.
    const uid = node.attrs?.uid ?? blockUid;

    if (node.type === ASSET_NODE && node.attrs?.document_id) {
      push({
        from_block_id:      uid ?? null,
        target_kind:        'asset',
        target_doc_id:      null,
        target_doc_ref:     null,
        target_document_id: node.attrs.document_id,
      });
    }

    // A transclusion is a reference too — it must reach the graph, or the P3
    // publish walk would miss a page the pack actually shows.
    if (node.type === EMBED_NODE && (node.attrs?.target_doc_id || node.attrs?.target_slug)) {
      push({
        from_block_id:      uid ?? null,
        target_kind:        'doc',
        target_doc_id:      node.attrs.target_doc_id ?? null,
        target_doc_ref:     node.attrs.target_slug ?? null,
        target_document_id: null,
      });
    }

    // Cross-links are a MARK on inline text, not a node of their own.
    for (const mark of node.marks ?? []) {
      if (mark?.type !== DOC_LINK_MARK) continue;
      const docId = mark.attrs?.target_doc_id ?? null;
      const slug  = mark.attrs?.target_slug ?? null;
      if (!docId && !slug) continue;          // nothing to point at
      push({
        from_block_id:      uid ?? null,
        target_kind:        'doc',
        target_doc_id:      docId,
        target_doc_ref:     slug,
        target_document_id: null,
      });
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child, uid);
    }
  };

  walk(blocks, null);
  return found;
}

/**
 * Every reference in a whole pack, straight from the pages' blocks.
 *
 * Deliberately does NOT read dossier_links: that table only has rows for pages
 * saved since it existed, so anything authored earlier would be invisible to a
 * check built on it. The blocks are the source of truth and are already in
 * memory, so the check is both correct and free.
 *
 * @param {object[]} docs
 */
export function extractAllLinks(docs = []) {
  return docs.flatMap(doc =>
    extractLinks(doc?.blocks).map(link => ({
      ...link,
      from_doc_id: doc.id,
      origin: { type: 'page', id: doc.id, title: doc.title ?? 'Untitled page' },
    })));
}

/**
 * References carried by table ROWS rather than by page blocks.
 *
 * A chronology entry can point at a page ("the detail is here") or at a file on
 * the shelf. Those are references like any other and MUST reach the same graph:
 * without this, the broken-reference check would not notice a row pointing at a
 * deleted page, and — far worse — the P3 publish walk would miss a page that is
 * only reachable from a chronology, publishing a pack whose own timeline links
 * into nothing.
 *
 * @param {object[]} datasets
 * @param {object[]} records - every record in the pack, not just one table's
 */
export function extractRecordLinks(datasets = [], records = []) {
  const byId = new Map(datasets.map(d => [d.id, d]));
  const links = [];

  for (const record of records) {
    const dataset = byId.get(record?.dataset_id);
    if (!dataset) continue;
    const origin = {
      type: 'table', id: dataset.id, title: dataset.title ?? 'Table',
      record_id: record.id,
    };

    if (record.doc_id) {
      links.push({
        from_block_id: null, target_kind: 'doc',
        target_doc_id: record.doc_id, target_doc_ref: null,
        target_document_id: null, origin,
      });
    }
    if (record.document_id) {
      links.push({
        from_block_id: null, target_kind: 'asset',
        target_doc_id: null, target_doc_ref: null,
        target_document_id: record.document_id, origin,
      });
    }
  }

  return links;
}

/**
 * Pages that SHOW one of the pack's tables.
 *
 * Kept out of extractLinks() on purpose: these never reach dossier_links. That
 * table's CHECK admits only 'doc' and 'asset', and widening it would buy
 * nothing — a table cannot leave the pack the way a shared-library file can, so
 * the only failure mode is "the author deleted it", which the in-memory blocks
 * already tell us. Persisting it would be a migration for a fact we hold.
 *
 * @param {object[]} docs
 */
export function extractDatasetEmbeds(docs = []) {
  const found = [];

  const walk = (node, blockUid, doc) => {
    if (!node || typeof node !== 'object') return;
    const uid = node.attrs?.uid ?? blockUid;

    if (node.type === 'embedDataset' && node.attrs?.dataset_id) {
      found.push({
        from_doc_id:        doc.id,
        origin:             { type: 'page', id: doc.id, title: doc.title ?? 'Untitled page' },
        from_block_id:      uid ?? null,
        target_kind:        'dataset',
        target_dataset_id:  node.attrs.dataset_id,
        target_dataset_ref: node.attrs.dataset_title ?? null,
      });
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child, uid, doc);
    }
  };

  for (const doc of docs) walk(doc?.blocks, null, doc);
  return found;
}

/**
 * Every reference in a pack, from pages AND tables — what the broken-reference
 * check reads, and the shape the P3 publish walk will need.
 */
export function extractPackReferences(docs = [], datasets = [], records = []) {
  return [
    ...extractAllLinks(docs),
    ...extractRecordLinks(datasets, records),
    ...extractDatasetEmbeds(docs),
  ];
}

/**
 * Identity of a reference, for deduping and diffing. Deliberately excludes
 * target_doc_ref: a page renamed does not change which link this is, and
 * including it would make every rename look like a link change.
 */
export function linkKey(link) {
  return [
    link.from_block_id ?? '',
    link.target_kind,
    link.target_doc_id ?? link.target_document_id ?? '',
  ].join('|');
}

/**
 * What to write so the stored rows match the page.
 *
 * Returns empty arrays when nothing changed — the property that keeps autosave
 * from churning the table, and the one worth testing hardest.
 *
 * @param {object[]} existing  - rows already in dossier_links for this doc
 * @param {object[]} extracted - the result of extractLinks()
 * @returns {{ toInsert: object[], toDeleteIds: string[], changed: boolean }}
 */
export function diffLinks(existing = [], extracted = []) {
  const existingByKey = new Map(existing.map(row => [linkKey(row), row]));
  const extractedKeys = new Set(extracted.map(linkKey));

  const toInsert = extracted.filter(link => !existingByKey.has(linkKey(link)));
  const toDeleteIds = existing
    .filter(row => !extractedKeys.has(linkKey(row)))
    .map(row => row.id);

  return {
    toInsert,
    toDeleteIds,
    changed: toInsert.length > 0 || toDeleteIds.length > 0,
  };
}

/**
 * A cheap fingerprint of a page's references, used to skip the reconcile query
 * entirely when an autosave changed only prose. Order-independent, so moving a
 * paragraph without changing what it links to is not a change.
 */
export function linkSignature(extracted = []) {
  return extracted.map(linkKey).sort().join(';');
}

/**
 * Group backlink rows into one entry per referring page.
 *
 * @param {object[]} rows - dossier_links rows joined to their from_doc
 * @returns {{doc_id: string, title: string, slug: string, blocks: string[]}[]}
 */
export function groupBacklinks(rows = []) {
  /** @type {Map<string, any>} */
  const byDoc = new Map();

  for (const row of rows) {
    const doc = row.from_doc ?? {};
    const id = row.from_doc_id;
    if (!id) continue;
    if (!byDoc.has(id)) {
      byDoc.set(id, {
        doc_id: id,
        title:  doc.title ?? 'Untitled page',
        slug:   doc.slug ?? '',
        blocks: [],
      });
    }
    if (row.from_block_id) byDoc.get(id).blocks.push(row.from_block_id);
  }

  return [...byDoc.values()].sort((a, b) => a.title.localeCompare(b.title));
}
