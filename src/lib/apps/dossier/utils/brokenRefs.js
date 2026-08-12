// src/lib/apps/dossier/utils/brokenRefs.js
// Finding references that no longer resolve — pure, Type-1 testable.
//
// P1 step 5. Two things can rot underneath a pack without anyone noticing:
//   * a page is deleted, and every link and embed pointing at it dangles;
//   * a file is removed from the shelf (or from the shared document library by
//     an admin, entirely outside Dossier), and its blocks still reference it.
//
// Neither can be prevented by a foreign key — the doc FK is deliberately ON
// DELETE SET NULL so the evidence survives (migration 174), and document_library
// is shared infrastructure the portal convention says not to constrain against.
// Detection is therefore the answer, and this is it.

/**
 * @param {object[]} links - dossier_links rows for the pack
 * @param {object[]} docs  - the pack's pages
 * @param {object[]} files - the pack's shelf (document_library rows)
 * @returns {{ origin: {type:'page'|'table', id: string, title: string},
 *             from_block_id: string|null, kind: 'doc'|'asset',
 *             label: string, reason: 'deleted-page'|'missing-file' }[]}
 */
export function findBrokenReferences(links = [], docs = [], files = []) {
  const docIds  = new Set(docs.map(d => d.id));
  const fileIds = new Set(files.map(f => f.id));
  const titleOf = new Map(docs.map(d => [d.id, d.title]));

  const broken = [];

  for (const link of links) {
    // Where the reference lives: a page, or a row in a table. Both are worth
    // reporting, and both need to be reachable from the panel.
    const origin = link.origin ?? {
      type: 'page', id: link.from_doc_id,
      title: titleOf.get(link.from_doc_id) ?? 'Untitled page',
    };

    if (link.target_kind === 'doc') {
      // Either the FK was nulled by the delete, or the id no longer resolves.
      const stillThere = link.target_doc_id && docIds.has(link.target_doc_id);
      if (stillThere) continue;
      broken.push({
        origin,
        from_block_id:  link.from_block_id ?? null,
        kind:           'doc',
        // The slug is what survives a deletion, so it is the only name we can
        // still show for the thing that is gone.
        label:          link.target_doc_ref || 'a deleted page',
        reason:         'deleted-page',
      });
      continue;
    }

    if (link.target_kind === 'asset') {
      if (link.target_document_id && fileIds.has(link.target_document_id)) continue;
      broken.push({
        origin,
        from_block_id:  link.from_block_id ?? null,
        kind:           'asset',
        label:          'a file that is no longer on the shelf',
        reason:         'missing-file',
      });
    }
  }

  // Group visually by where they live, stable between loads.
  return broken.sort((a, b) =>
    a.origin.title.localeCompare(b.origin.title) || a.label.localeCompare(b.label));
}

/** One line summarising the state of a pack's references. */
export function describeBrokenReferences(broken = []) {
  if (!broken.length) return '';
  const places = new Set(broken.map(b => `${b.origin.type}:${b.origin.id}`)).size;
  const refs   = broken.length;
  return `${refs} broken reference${refs === 1 ? '' : 's'} in ${places} place${places === 1 ? '' : 's'}`;
}
