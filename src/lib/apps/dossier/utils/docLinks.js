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
