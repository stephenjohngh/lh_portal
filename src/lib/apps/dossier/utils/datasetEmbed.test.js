// src/lib/apps/dossier/utils/datasetEmbed.test.js
// P2 step 2 — showing a table inside a page.
//
// The pure half: which embeds a pack's blocks declare, and what the broken
// reference check makes of one whose table is gone.

import { describe, it, expect } from 'vitest';
import { extractDatasetEmbeds, extractPackReferences } from './docLinks.js';
import { findBrokenReferences } from './brokenRefs.js';

const embedNode = (datasetId, title, uid = 'b1') => ({
  type: 'embedDataset', attrs: { uid, dataset_id: datasetId, dataset_title: title },
});

const page = (id, title, ...nodes) => ({
  id, title, blocks: { type: 'doc', content: nodes },
});

describe('extractDatasetEmbeds', () => {
  it('finds an embed and attributes it to its page and block', () => {
    const found = extractDatasetEmbeds([page('p1', 'Overview', embedNode('d1', 'Chronology'))]);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      from_doc_id: 'p1',
      from_block_id: 'b1',
      target_kind: 'dataset',
      target_dataset_id: 'd1',
      target_dataset_ref: 'Chronology',
    });
    expect(found[0].origin).toEqual({ type: 'page', id: 'p1', title: 'Overview' });
  });

  it('finds embeds nested inside a toggle', () => {
    const toggle = {
      type: 'toggle', attrs: { uid: 't1' },
      content: [{ type: 'toggleBody', content: [embedNode('d1', 'Chronology', undefined)] }],
    };
    // The inner node carries no uid of its own, so it inherits the toggle's.
    delete toggle.content[0].content[0].attrs.uid;

    const found = extractDatasetEmbeds([page('p1', 'Overview', toggle)]);
    expect(found).toHaveLength(1);
    expect(found[0].from_block_id).toBe('t1');
  });

  it('ignores an embed with no target', () => {
    const orphan = { type: 'embedDataset', attrs: { uid: 'b1', dataset_id: null } };
    expect(extractDatasetEmbeds([page('p1', 'Overview', orphan)])).toEqual([]);
  });

  it('is included in the pack-wide reference sweep', () => {
    const refs = extractPackReferences(
      [page('p1', 'Overview', embedNode('d1', 'Chronology'))], [], []);
    expect(refs.filter(r => r.target_kind === 'dataset')).toHaveLength(1);
  });
});

describe('findBrokenReferences — deleted tables', () => {
  const docs = [page('p1', 'Overview', embedNode('d1', 'Chronology'))];
  const refs = () => extractPackReferences(docs, [], []);

  it('reports a page showing a table that no longer exists', () => {
    const broken = findBrokenReferences(refs(), docs, [], [{ id: 'd2', title: 'Other' }]);

    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ kind: 'dataset', reason: 'deleted-table' });
    // The remembered title is the only name left for something deleted.
    expect(broken[0].label).toContain('Chronology');
  });

  it('says nothing while the table is still there', () => {
    expect(findBrokenReferences(refs(), docs, [], [{ id: 'd1', title: 'Chronology' }]))
      .toEqual([]);
  });

  it('does not accuse an embed before the tables have loaded', () => {
    // The panel renders on first paint, when datasets is still []. Treating
    // that as "all deleted" would stamp a warning over every healthy pack.
    expect(findBrokenReferences(refs(), docs, [], [])).toEqual([]);
  });

  it('still reports broken pages and files alongside a broken table', () => {
    const withLink = [{
      ...docs[0],
      blocks: {
        type: 'doc',
        content: [
          embedNode('d1', 'Chronology'),
          {
            type: 'paragraph', attrs: { uid: 'b2' },
            content: [{
              type: 'text', text: 'see',
              marks: [{ type: 'docLink', attrs: { target_doc_id: 'gone', target_slug: 'gone' } }],
            }],
          },
        ],
      },
    }];
    const broken = findBrokenReferences(
      extractPackReferences(withLink, [], []), withLink, [], [{ id: 'd2' }]);

    expect(broken.map(b => b.kind).sort()).toEqual(['dataset', 'doc']);
  });
});
