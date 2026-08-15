// src/lib/apps/dossier/utils/packSearch.js
// Search across a whole pack — pure, Type-1 testable, no DOM and no DB.
//
// Merge doc D7 settled a direct contradiction between the two source specs:
// spec 1 wanted search over content, headings, timeline entries and embedded
// metadata; spec 2 put search out of scope for v1. The resolution was to defer
// it and then deliver the NARROWER version — within a pack, never across
// publications, because cross-pack search over owner-scoped confidential
// material is a leak waiting to be written.
//
// So this searches one pack's own content and nothing else. It is called from
// two places with the same arguments — the authoring workspace and the
// published reader — which is the same discipline as the shared renderer: one
// definition of what "found" means, so the author and the recipient are looking
// at the same pack.
//
// Table entries are searched as well as pages. A chronology is often the thing
// a reader is scanning for ("when did we first write to them?"), and a search
// that silently ignored the tables would answer that question wrongly.

import { templateFor, columnFields, rowFields } from './datasetTemplates.js';

/** Characters either side of a hit in the snippet. */
const SNIPPET_PAD = 60;
/** Enough to find something; past this the answer is "refine the query". */
export const MAX_RESULTS = 50;
/** Below this a query matches most of the pack and helps nobody. */
export const MIN_QUERY = 2;

/**
 * Text of a page, one entry per addressable block.
 *
 * Per block rather than one string for the whole page, so a snippet can be
 * built around the hit and — once block anchors are wired — scrolled to. Walks
 * the ProseMirror JSON directly: no Tiptap, no DOM, safe on the server.
 *
 * @param {object|null} blocks
 * @returns {{ uid: string|null, text: string }[]}
 */
export function blockTextRuns(blocks) {
  /** @type {{ uid: string|null, text: string }[]} */
  const runs = [];

  const walk = (node, uid) => {
    if (!node || typeof node !== 'object') return;
    const here = node.attrs?.uid ?? uid;

    if (typeof node.text === 'string' && node.text.trim()) {
      const last = runs[runs.length - 1];
      // Marks split a sentence into several text nodes — "the **notice** was
      // served" is three. Joining runs that share a block keeps a phrase
      // searchable across a bold word in the middle of it.
      if (last && last.uid === here) last.text += node.text;
      else runs.push({ uid: here ?? null, text: node.text });
    }

    if (Array.isArray(node.content)) for (const child of node.content) walk(child, here);
  };

  walk(blocks, null);
  return runs.map(run => ({ ...run, text: run.text.replace(/\s+/g, ' ').trim() }))
    .filter(run => run.text);
}

/**
 * A readable fragment around the first hit, with the hit marked.
 *
 * Returns the offsets rather than HTML: the caller decides how to emphasise a
 * match, and building markup here would mean escaping author text in a module
 * that has no business doing it.
 *
 * @returns {{ text: string, from: number, to: number } | null}
 */
export function snippetAround(text, query) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1) return null;

  const start = Math.max(0, at - SNIPPET_PAD);
  const end   = Math.min(text.length, at + query.length + SNIPPET_PAD);
  const lead  = start > 0 ? '…' : '';
  const tail  = end < text.length ? '…' : '';

  return {
    text: `${lead}${text.slice(start, end)}${tail}`,
    from: lead.length + (at - start),
    to:   lead.length + (at - start) + query.length,
  };
}

/**
 * Search a pack's pages and table entries.
 *
 * Ordering is by KIND then document order, not by a relevance score: a pack is
 * small enough that a reader wants to know where in the pack a phrase appears,
 * and an invented ranking would shuffle a chronology out of date order for no
 * gain.
 *
 * @param {{ docs?: object[], datasets?: object[], records?: object[] }} content
 * @param {string} query
 * @returns {{ kind: 'page'|'entry', docId: string|null, datasetId: string|null,
 *             title: string, where: string, blockUid: string|null,
 *             snippet: { text: string, from: number, to: number } }[]}
 */
export function searchPack({ docs = [], datasets = [], records = [] } = {}, query) {
  const q = String(query ?? '').trim();
  if (q.length < MIN_QUERY) return [];

  const needle = q.toLowerCase();
  const results = [];

  // ── Pages: the title first, then the blocks in document order.
  for (const doc of docs) {
    const title = doc.title ?? 'Untitled page';

    const inTitle = snippetAround(title, q);
    if (inTitle) {
      results.push({
        kind: 'page', docId: doc.id, datasetId: null,
        title, where: 'Page name', blockUid: null, snippet: inTitle,
      });
    }

    for (const run of blockTextRuns(doc.blocks)) {
      if (!run.text.toLowerCase().includes(needle)) continue;
      results.push({
        kind: 'page', docId: doc.id, datasetId: null,
        title, where: 'On this page', blockUid: run.uid,
        snippet: snippetAround(run.text, q),
      });
      if (results.length >= MAX_RESULTS) return results;
    }
  }

  // ── Table entries. A row is reported once, naming the column it was found
  //    in — the same row matching twice is one result to a reader.
  const datasetById = new Map(datasets.map(d => [d.id, d]));

  for (const record of records) {
    const dataset = datasetById.get(record?.dataset_id);
    if (!dataset) continue;
    if (!templateFor(dataset.key)) continue;

    // Both, because a correspondence body renders on a line of its own rather
    // than as a column — and the body is the most searchable thing in the row.
    const fields = [...columnFields(dataset.key), ...rowFields(dataset.key)];
    for (const field of fields) {
      const value = String(record.fields?.[field.key] ?? '');
      if (!value || !value.toLowerCase().includes(needle)) continue;

      results.push({
        kind: 'entry', docId: null, datasetId: dataset.id,
        title: dataset.title ?? 'Table',
        where: field.label, blockUid: null,
        snippet: snippetAround(value, q),
      });
      break;                       // one result per row
    }
    if (results.length >= MAX_RESULTS) return results;
  }

  return results;
}

/**
 * One line describing the outcome, so the empty case is never a blank panel.
 *
 * @param {object[]} results
 * @param {string} query
 */
export function describeResults(results, query) {
  const q = String(query ?? '').trim();
  if (q.length < MIN_QUERY) return `Type at least ${MIN_QUERY} characters.`;
  if (!results.length) return `Nothing in this pack matches “${q}”.`;

  const capped = results.length >= MAX_RESULTS ? ' (showing the first ' + MAX_RESULTS + ')' : '';
  const pages  = new Set(results.filter(r => r.kind === 'page').map(r => r.docId)).size;
  const rows   = results.filter(r => r.kind === 'entry').length;

  const parts = [];
  if (pages) parts.push(`${pages} page${pages === 1 ? '' : 's'}`);
  if (rows)  parts.push(`${rows} table ${rows === 1 ? 'entry' : 'entries'}`);

  return `${results.length} result${results.length === 1 ? '' : 's'} in ${parts.join(' and ')}${capped}.`;
}
