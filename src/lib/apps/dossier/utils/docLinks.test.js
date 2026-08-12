// src/lib/apps/dossier/utils/docLinks.test.js
// Type-1 tests for the link graph. The no-churn property is the one that
// matters most: autosave fires constantly, and a page whose references have
// not changed must produce no database writes at all.

import { describe, it, expect } from 'vitest';
import {
  extractLinks, extractRecordLinks, extractPackReferences,
  diffLinks, linkKey, linkSignature, groupBacklinks,
} from './docLinks.js';

const doc = (...content) => ({ type: 'doc', content });

/** A paragraph carrying a block uid, containing text with optional marks. */
const para = (uid, ...content) => ({ type: 'paragraph', attrs: { uid }, content });

const linkText = (text, target_doc_id, target_slug = null) => ({
  type: 'text', text,
  marks: [{ type: 'docLink', attrs: { target_doc_id, target_slug } }],
});

const assetNode = (uid, document_id) => ({
  type: 'asset', attrs: { uid, document_id },
});

describe('extractLinks', () => {
  it('finds a cross-link mark and attributes it to its block', () => {
    const links = extractLinks(doc(para('b1', linkText('see chronology', 'doc-2', 'chronology'))));
    expect(links).toEqual([{
      from_block_id: 'b1', target_kind: 'doc',
      target_doc_id: 'doc-2', target_doc_ref: 'chronology', target_document_id: null,
    }]);
  });

  it('finds an asset reference', () => {
    const links = extractLinks(doc(assetNode('b2', 'file-9')));
    expect(links).toEqual([{
      from_block_id: 'b2', target_kind: 'asset',
      target_doc_id: null, target_doc_ref: null, target_document_id: 'file-9',
    }]);
  });

  it('reaches references nested inside containers', () => {
    // A link inside a callout inside a toggle body still belongs to the graph.
    const links = extractLinks(doc({
      type: 'toggle', attrs: { uid: 'tog' },
      content: [
        { type: 'toggleSummary', content: [{ type: 'text', text: 'Detail' }] },
        { type: 'toggleBody', content: [
          { type: 'callout', attrs: { uid: 'call' },
            content: [para('deep', linkText('here', 'doc-3'))] },
        ] },
      ],
    }));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ from_block_id: 'deep', target_doc_id: 'doc-3' });
  });

  it('attributes a reference to the NEAREST enclosing block with a uid', () => {
    // The asset has its own uid, so it anchors to itself, not the callout.
    const links = extractLinks(doc({
      type: 'callout', attrs: { uid: 'outer' },
      content: [assetNode('inner', 'file-1')],
    }));
    expect(links[0].from_block_id).toBe('inner');
  });

  it('falls back to an ancestor uid when the node has none', () => {
    const links = extractLinks(doc(
      { type: 'callout', attrs: { uid: 'outer' },
        content: [{ type: 'paragraph', content: [linkText('x', 'doc-1')] }] },
    ));
    expect(links[0].from_block_id).toBe('outer');
  });

  it('records null rather than dropping a reference it cannot attribute', () => {
    const links = extractLinks(doc({ type: 'paragraph', content: [linkText('x', 'doc-1')] }));
    expect(links).toHaveLength(1);
    expect(links[0].from_block_id).toBeNull();
  });

  it('collapses the same target referenced twice from one block', () => {
    const links = extractLinks(doc(para('b1',
      linkText('first', 'doc-2'), { type: 'text', text: ' and ' }, linkText('again', 'doc-2'),
    )));
    expect(links).toHaveLength(1);
  });

  it('keeps the same target referenced from two blocks — different anchors', () => {
    const links = extractLinks(doc(
      para('b1', linkText('a', 'doc-2')),
      para('b2', linkText('b', 'doc-2')),
    ));
    expect(links).toHaveLength(2);
  });

  it('ignores ordinary links and text', () => {
    const links = extractLinks(doc(para('b1',
      { type: 'text', text: 'plain' },
      { type: 'text', text: 'external',
        marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] },
    )));
    expect(links).toEqual([]);
  });

  it('ignores a mark or asset that points at nothing', () => {
    expect(extractLinks(doc(para('b1', {
      type: 'text', text: 'x', marks: [{ type: 'docLink', attrs: {} }],
    })))).toEqual([]);
    expect(extractLinks(doc({ type: 'asset', attrs: { uid: 'a' } }))).toEqual([]);
  });

  it('handles an empty or malformed doc', () => {
    expect(extractLinks(doc())).toEqual([]);
    expect(extractLinks(null)).toEqual([]);
    expect(extractLinks(undefined)).toEqual([]);
    expect(extractLinks({})).toEqual([]);
  });
});

describe('extractRecordLinks', () => {
  const datasets = [{ id: 'ds1', title: 'Chronology' }];

  it('finds a row pointing at a page', () => {
    const links = extractRecordLinks(datasets, [
      { id: 'r1', dataset_id: 'ds1', doc_id: 'doc-2' },
    ]);
    expect(links).toEqual([{
      from_block_id: null, target_kind: 'doc',
      target_doc_id: 'doc-2', target_doc_ref: null, target_document_id: null,
      origin: { type: 'table', id: 'ds1', title: 'Chronology', record_id: 'r1' },
    }]);
  });

  it('finds a row pointing at a file', () => {
    const links = extractRecordLinks(datasets, [
      { id: 'r1', dataset_id: 'ds1', document_id: 'f9' },
    ]);
    expect(links[0]).toMatchObject({ target_kind: 'asset', target_document_id: 'f9' });
  });

  it('ignores a row with no reference', () => {
    expect(extractRecordLinks(datasets, [{ id: 'r1', dataset_id: 'ds1' }])).toEqual([]);
  });

  it('ignores a row whose table is not in the pack', () => {
    expect(extractRecordLinks(datasets, [
      { id: 'r1', dataset_id: 'gone', doc_id: 'doc-2' },
    ])).toEqual([]);
  });

  it('handles empty input', () => {
    expect(extractRecordLinks()).toEqual([]);
    expect(extractRecordLinks([], [])).toEqual([]);
  });
});

describe('extractPackReferences', () => {
  it('combines page references and table references', () => {
    // Without the table half, the P3 publish walk would miss a page reachable
    // only from a chronology row — publishing a pack that links into nothing.
    const docs = [{
      id: 'd1', title: 'Overview',
      blocks: doc(para('b1', linkText('see', 'doc-2'))),
    }];
    const refs = extractPackReferences(
      docs,
      [{ id: 'ds1', title: 'Chronology' }],
      [{ id: 'r1', dataset_id: 'ds1', doc_id: 'doc-3' }],
    );
    expect(refs.map(r => r.origin.type)).toEqual(['page', 'table']);
    expect(refs.map(r => r.target_doc_id)).toEqual(['doc-2', 'doc-3']);
  });
});

describe('diffLinks — the no-churn rule', () => {
  const row = (id, key) => ({
    id, from_block_id: key, target_kind: 'doc',
    target_doc_id: 'doc-2', target_doc_ref: 'chronology', target_document_id: null,
  });

  it('reports NO change when the references are identical', () => {
    // The property autosave depends on: prose edits must write nothing.
    const existing  = [row('r1', 'b1')];
    const extracted = [{
      from_block_id: 'b1', target_kind: 'doc',
      target_doc_id: 'doc-2', target_doc_ref: 'chronology', target_document_id: null,
    }];
    const diff = diffLinks(existing, extracted);
    expect(diff.changed).toBe(false);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toDeleteIds).toEqual([]);
  });

  it('ignores a changed slug — a rename is not a link change', () => {
    // Slugs never change on rename today, but the key must not depend on a
    // display value either way.
    const existing  = [row('r1', 'b1')];
    const extracted = [{
      from_block_id: 'b1', target_kind: 'doc',
      target_doc_id: 'doc-2', target_doc_ref: 'renamed-slug', target_document_id: null,
    }];
    expect(diffLinks(existing, extracted).changed).toBe(false);
  });

  it('inserts a new reference', () => {
    const diff = diffLinks([], [{
      from_block_id: 'b1', target_kind: 'doc',
      target_doc_id: 'doc-2', target_doc_ref: null, target_document_id: null,
    }]);
    expect(diff.toInsert).toHaveLength(1);
    expect(diff.toDeleteIds).toEqual([]);
    expect(diff.changed).toBe(true);
  });

  it('deletes a reference the author removed', () => {
    const diff = diffLinks([row('r1', 'b1')], []);
    expect(diff.toDeleteIds).toEqual(['r1']);
    expect(diff.toInsert).toEqual([]);
  });

  it('handles a reference that moved to another block as delete + insert', () => {
    const diff = diffLinks([row('r1', 'b1')], [{
      from_block_id: 'b2', target_kind: 'doc',
      target_doc_id: 'doc-2', target_doc_ref: null, target_document_id: null,
    }]);
    expect(diff.toDeleteIds).toEqual(['r1']);
    expect(diff.toInsert).toHaveLength(1);
  });

  it('distinguishes a doc target from an asset target with the same id', () => {
    expect(linkKey({ from_block_id: 'b', target_kind: 'doc', target_doc_id: 'x' }))
      .not.toBe(linkKey({ from_block_id: 'b', target_kind: 'asset', target_document_id: 'x' }));
  });
});

describe('linkSignature', () => {
  const link = (block, target) => ({
    from_block_id: block, target_kind: 'doc', target_doc_id: target,
  });

  it('is stable regardless of order — moving a paragraph is not a change', () => {
    expect(linkSignature([link('b1', 'd1'), link('b2', 'd2')]))
      .toBe(linkSignature([link('b2', 'd2'), link('b1', 'd1')]));
  });

  it('changes when a reference is added or removed', () => {
    expect(linkSignature([link('b1', 'd1')]))
      .not.toBe(linkSignature([link('b1', 'd1'), link('b2', 'd2')]));
  });

  it('is empty for a page with no references', () => {
    expect(linkSignature([])).toBe('');
  });
});

describe('groupBacklinks', () => {
  const row = (fromId, title, blockId) => ({
    from_doc_id: fromId, from_block_id: blockId, from_doc: { title, slug: title.toLowerCase() },
  });

  it('collapses many rows into one entry per referring page', () => {
    const grouped = groupBacklinks([
      row('d1', 'Overview', 'b1'),
      row('d1', 'Overview', 'b2'),
      row('d2', 'Chronology', 'b9'),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped.find(g => g.doc_id === 'd1').blocks).toEqual(['b1', 'b2']);
  });

  it('sorts by title so the list is stable between loads', () => {
    const grouped = groupBacklinks([row('d1', 'Zebra', 'b'), row('d2', 'Alpha', 'b')]);
    expect(grouped.map(g => g.title)).toEqual(['Alpha', 'Zebra']);
  });

  it('tolerates a missing join and a missing block anchor', () => {
    const grouped = groupBacklinks([{ from_doc_id: 'd1' }]);
    expect(grouped[0]).toMatchObject({ title: 'Untitled page', blocks: [] });
  });

  it('skips a row with no referring page', () => {
    expect(groupBacklinks([{ from_block_id: 'b' }])).toEqual([]);
    expect(groupBacklinks([])).toEqual([]);
  });
});
