// src/lib/apps/dossier/utils/packCopy.test.js
// Duplicating a pack.
//
// The whole risk of this feature is a reference that still points at the pack
// it was copied from, so most of these tests are one question asked of each
// kind of reference in turn: does anything in the copy still name the original?

import { describe, it, expect } from 'vitest';
import { remapBlocks, planPackCopy, copyTitle, describePackCopy } from './packCopy.js';

/** Deterministic ids, so a failure names the thing that went wrong. */
function counter(prefix = 'new') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const para = (uid, content) => ({ type: 'paragraph', attrs: { uid }, content });

describe('remapBlocks — every kind of reference', () => {
  it('rewrites a docLink mark to the copied page', () => {
    const blocks = {
      type: 'doc',
      content: [para('u1', [{
        type: 'text', text: 'see the timeline',
        marks: [{ type: 'docLink', attrs: { target_doc_id: 'old-doc', target_slug: 'timeline' } }],
      }])],
    };

    const { blocks: out } = remapBlocks(
      blocks, { docs: new Map([['old-doc', 'new-doc']]) }, counter());

    const mark = out.content[0].content[0].marks[0];
    expect(mark.attrs.target_doc_id).toBe('new-doc');
    // The slug is a per-pack name and resolves in the copy unchanged; rewriting
    // it would be wrong, and it is the fallback if an id ever fails to map.
    expect(mark.attrs.target_slug).toBe('timeline');
  });

  it('rewrites an embedDoc node', () => {
    const blocks = { type: 'doc', content: [
      { type: 'embedDoc', attrs: { uid: 'u1', target_doc_id: 'old-doc', target_slug: 'annex' } },
    ] };

    const { blocks: out } = remapBlocks(
      blocks, { docs: new Map([['old-doc', 'new-doc']]) }, counter());
    expect(out.content[0].attrs.target_doc_id).toBe('new-doc');
  });

  it('rewrites an embedDataset node to the copied table', () => {
    const blocks = { type: 'doc', content: [
      { type: 'embedDataset', attrs: { uid: 'u1', dataset_id: 'old-set', dataset_title: 'Chronology' } },
    ] };

    const { blocks: out } = remapBlocks(
      blocks, { datasets: new Map([['old-set', 'new-set']]) }, counter());
    expect(out.content[0].attrs.dataset_id).toBe('new-set');
  });

  it('rewrites an asset node — BOTH ids it carries', () => {
    // provider_file_id is cached on the block and is what the media proxy is
    // addressed by. Rewriting document_id alone would leave the copy serving
    // the ORIGINAL file's bytes.
    const blocks = { type: 'doc', content: [
      { type: 'asset', attrs: {
        uid: 'u1', document_id: 'old-file', provider_file_id: 'drive-old',
        filename: 'logo.png' } },
    ] };

    const { blocks: out } = remapBlocks(blocks, {
      files: new Map([['old-file', { id: 'new-file', provider_file_id: 'drive-new' }]]),
    }, counter());

    expect(out.content[0].attrs.document_id).toBe('new-file');
    expect(out.content[0].attrs.provider_file_id).toBe('drive-new');
    expect(JSON.stringify(out)).not.toContain('drive-old');
  });

  it('re-mints every block uid', () => {
    // blockId.js's rule at pack scale: a copied block keeping its original's
    // uid means two blocks share an identity that links resolve through.
    const blocks = { type: 'doc', content: [para('u1', []), para('u2', [])] };
    const { blocks: out } = remapBlocks(blocks, {}, counter());

    expect(out.content.map(n => n.attrs.uid)).toEqual(['new-1', 'new-2']);
  });

  it('does not mutate the source pack-s blocks', () => {
    const blocks = { type: 'doc', content: [
      { type: 'asset', attrs: { uid: 'u1', document_id: 'old-file' } },
    ] };
    const before = JSON.stringify(blocks);

    remapBlocks(blocks, { files: new Map([['old-file', { id: 'new-file' }]]) }, counter());
    expect(JSON.stringify(blocks)).toBe(before);
  });
});

describe('remapBlocks — a reference with nowhere to go', () => {
  const withFile = () => ({ type: 'doc', content: [
    { type: 'asset', attrs: {
      uid: 'u1', document_id: 'old-file', provider_file_id: 'drive-old',
      filename: 'schedule.xlsx',
      sheet_preview: { rows: [['Flat 4', 'unpaid since March']] } } },
  ] });

  it('empties it rather than leaving it pointing at the source pack', () => {
    const { blocks: out, dropped } = remapBlocks(withFile(), {}, counter());

    expect(out.content[0].attrs.document_id).toBeNull();
    expect(dropped.files).toBe(1);
    // A dangling reference is reported by the broken-reference panel. One that
    // still names the original pack is neither visible nor correct.
    expect(JSON.stringify(out)).not.toContain('old-file');
  });

  it('clears the cached spreadsheet preview with it', () => {
    // The preview is the source file's CONTENT, held in the block. Left behind,
    // a pack whose files were deliberately not copied would still show the
    // previous matter's figures — and would publish them.
    const { blocks: out } = remapBlocks(withFile(), {}, counter());
    expect(out.content[0].attrs.sheet_preview).toBeNull();
    expect(JSON.stringify(out)).not.toContain('unpaid since March');
  });

  it('keeps the filename, so the gap can be named', () => {
    const { blocks: out } = remapBlocks(withFile(), {}, counter());
    expect(out.content[0].attrs.filename).toBe('schedule.xlsx');
  });
});

describe('planPackCopy', () => {
  const source = {
    docs: [
      { id: 'd1', parent_doc_id: null, slug: 'overview', title: 'Overview',
        order_index: 0, blocks: { type: 'doc', content: [
          { type: 'embedDataset', attrs: { uid: 'a', dataset_id: 's1' } },
          para('b', [{ type: 'text', text: 'detail',
            marks: [{ type: 'docLink', attrs: { target_doc_id: 'd2', target_slug: 'detail' } }] }]),
        ] } },
      { id: 'd2', parent_doc_id: 'd1', slug: 'detail', title: 'Detail',
        order_index: 1, blocks: { type: 'doc', content: [] } },
    ],
    datasets: [{ id: 's1', key: 'chronology', title: 'Chronology' }],
    records: [
      { id: 'r1', dataset_id: 's1', fields: { date: '2026-01-04', event: 'Letter sent' },
        position: 0, document_id: 'f1', doc_id: 'd2' },
    ],
  };

  it('gives every row a new id and none of the old ones survive anywhere', () => {
    const plan = planPackCopy(source, {
      packId: 'pack-2', includeRecords: true,
      files: new Map([['f1', { id: 'f2', provider_file_id: 'drive-2' }]]),
      mint: counter(),
    });

    const json = JSON.stringify({ docs: plan.docs, datasets: plan.datasets, records: plan.records });
    for (const oldId of ['d1', 'd2', 's1', 'r1', 'f1']) {
      expect(json).not.toContain(`"${oldId}"`);
    }
  });

  it('re-points the page tree at the copied parent', () => {
    const plan = planPackCopy(source, { packId: 'pack-2', mint: counter() });
    const [overview, detail] = plan.docs;

    expect(overview.parent_doc_id).toBeNull();
    expect(detail.parent_doc_id).toBe(overview.id);
  });

  it('resolves a cross-page link to the copied page, not the original', () => {
    const plan = planPackCopy(source, { packId: 'pack-2', mint: counter() });
    const mark = plan.docs[0].blocks.content[1].content[0].marks[0];

    expect(mark.attrs.target_doc_id).toBe(plan.docs[1].id);
  });

  it('keeps slugs, which are unique per pack', () => {
    const plan = planPackCopy(source, { packId: 'pack-2', mint: counter() });
    expect(plan.docs.map(d => d.slug)).toEqual(['overview', 'detail']);
  });

  it('copies tables but leaves out their entries by default', () => {
    // The confidentiality default: a template made from a real matter carries
    // that matter's chronology, and nothing downstream would object to it being
    // published to the next client.
    const plan = planPackCopy(source, { packId: 'pack-2', mint: counter() });

    expect(plan.datasets).toHaveLength(1);
    expect(plan.records).toEqual([]);
  });

  it('remaps a table row-s own references when entries are included', () => {
    const plan = planPackCopy(source, {
      packId: 'pack-2', includeRecords: true,
      files: new Map([['f1', { id: 'f2' }]]),
      mint: counter(),
    });

    expect(plan.records[0].document_id).toBe('f2');
    expect(plan.records[0].doc_id).toBe(plan.docs[1].id);
    expect(plan.records[0].fields).toEqual(source.records[0].fields);
  });

  it('empties a row-s file reference when the files were not copied', () => {
    const plan = planPackCopy(source, {
      packId: 'pack-2', includeRecords: true, mint: counter(),
    });

    expect(plan.records[0].document_id).toBeNull();
    expect(plan.dropped.files).toBe(1);
  });

  it('puts every row in the new pack', () => {
    const plan = planPackCopy(source, { packId: 'pack-2', mint: counter() });
    for (const row of [...plan.docs, ...plan.datasets]) {
      expect(row.pack_id).toBe('pack-2');
    }
  });

  it('drops a record whose table somehow did not come across', () => {
    const plan = planPackCopy(
      { ...source, records: [{ id: 'r9', dataset_id: 'gone', fields: {} }] },
      { packId: 'pack-2', includeRecords: true, mint: counter() });
    expect(plan.records).toEqual([]);
  });
});

describe('copyTitle', () => {
  it('marks the copy', () => {
    expect(copyTitle('Flat 4 dispute')).toBe('Flat 4 dispute (copy)');
  });

  it('numbers repeats rather than making two packs with one name', () => {
    expect(copyTitle('Template', ['Template', 'Template (copy)']))
      .toBe('Template (copy 2)');
    expect(copyTitle('Template', ['Template (copy)', 'Template (copy 2)']))
      .toBe('Template (copy 3)');
  });

  it('ignores case and surrounding space when checking', () => {
    expect(copyTitle('Template', ['  template (copy) '])).toBe('Template (copy 2)');
  });
});

describe('describePackCopy', () => {
  const source = { docs: [{}, {}], datasets: [{}], records: [{}, {}, {}], files: [{}] };

  it('says what the copy will contain, both ways round', () => {
    expect(describePackCopy(source, { includeRecords: true, includeFiles: true }))
      .toBe('The copy will have 2 pages, 1 table, 3 entries in them, 1 file.');
    expect(describePackCopy(source, { includeRecords: false, includeFiles: false }))
      .toBe('The copy will have 2 pages, 1 table, with no entries, no files.');
  });

  it('says nothing about tables or files a pack does not have', () => {
    const bare = { docs: [{}], datasets: [], records: [], files: [] };
    expect(describePackCopy(bare, { includeRecords: true, includeFiles: true }))
      .toBe('The copy will have 1 page, 0 tables.');
  });
});
