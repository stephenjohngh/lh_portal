// src/lib/apps/dossier/utils/snapshot.test.js
// P3 step 1 — freezing a pack, and deciding what a link may reach.
//
// These tests carry more weight than the usual pure-logic pass. The external
// boundary is not enforced by a permission check the recipient could be given
// too much of — it is enforced by the SHAPE of the data the reader is handed.
// Two properties matter above all:
//
//   1. the snapshot is self-contained (so the reader never needs a live table)
//   2. the manifest is an allow-list of what content actually references (so a
//      valid link cannot be walked outwards into the rest of the shelf)

import { describe, it, expect } from 'vitest';
import {
  buildSnapshot, buildManifest, referencedFileIds, manifestAllows, manifestEntry,
  describeInclusion, SNAPSHOT_FORMAT,
} from './snapshot.js';

const AT = '2026-08-12T10:00:00.000Z';

const assetNode = (documentId) => ({
  type: 'asset', attrs: { uid: 'b1', document_id: documentId },
});

const page = (id, title, order, ...nodes) => ({
  id, slug: title.toLowerCase().replace(/\W+/g, '-'), title,
  parent_id: null, order_index: order,
  blocks: { type: 'doc', content: nodes },
});

const shelfFile = (id, name, extra = {}) => ({
  id, filename: `${name}.pdf`, display_name: name, description: '',
  mime_type: 'application/pdf', file_size: 1024, provider_file_id: `drive-${id}`,
  ...extra,
});

const pack = { id: 'p1', title: 'Flat 4 dispute', description: 'For Smith & Co' };

describe('buildSnapshot', () => {
  it('carries the pack, its pages and their blocks', () => {
    const snapshot = buildSnapshot({
      pack, docs: [page('d1', 'Overview', 0)], generatedAt: AT,
    });

    expect(snapshot.format).toBe(SNAPSHOT_FORMAT);
    expect(snapshot.generated_at).toBe(AT);
    expect(snapshot.pack.title).toBe('Flat 4 dispute');
    expect(snapshot.docs[0].blocks).toEqual({ type: 'doc', content: [] });
  });

  it('orders pages by order_index, so two publications of one pack match', () => {
    const snapshot = buildSnapshot({
      pack, docs: [page('d2', 'Second', 5), page('d1', 'First', 1)], generatedAt: AT,
    });
    expect(snapshot.docs.map(d => d.id)).toEqual(['d1', 'd2']);
  });

  it('drops records whose table did not come with them', () => {
    // Otherwise they render nowhere and are data leaving the portal for nothing.
    const snapshot = buildSnapshot({
      pack,
      datasets: [{ id: 'ds1', key: 'chronology', title: 'Chronology' }],
      records: [
        { id: 'r1', dataset_id: 'ds1', fields: { event: 'kept' } },
        { id: 'r2', dataset_id: 'other', fields: { event: 'dropped' } },
      ],
      generatedAt: AT,
    });

    expect(snapshot.records.map(r => r.id)).toEqual(['r1']);
  });

  it('carries no revisions, no links and nothing about the author', () => {
    // A recipient gets the pack, not the workings.
    const snapshot = buildSnapshot({
      pack: { ...pack, created_by: 'u1' }, docs: [page('d1', 'Overview', 0)],
      generatedAt: AT,
    });

    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('u1');
    expect(snapshot).not.toHaveProperty('revisions');
    expect(snapshot).not.toHaveProperty('links');
    expect(snapshot.pack).not.toHaveProperty('created_by');
  });

  it('is SELF-CONTAINED — every dataset a record names is present', () => {
    // The property the whole external boundary rests on: the reader must never
    // have cause to look something up in a live table.
    const snapshot = buildSnapshot({
      pack,
      docs: [page('d1', 'Overview', 0, assetNode('f1'))],
      datasets: [{ id: 'ds1', key: 'chronology', title: 'Chronology' }],
      records: [{ id: 'r1', dataset_id: 'ds1', fields: {}, document_id: 'f1' }],
      files: [shelfFile('f1', 'Notice')],
      generatedAt: AT,
    });

    const datasetIds = new Set(snapshot.datasets.map(d => d.id));
    const fileIds = new Set(snapshot.files.map(f => f.id));

    for (const record of snapshot.records) {
      expect(datasetIds.has(record.dataset_id)).toBe(true);
      if (record.document_id) expect(fileIds.has(record.document_id)).toBe(true);
    }
    for (const id of referencedFileIds(snapshot)) expect(fileIds.has(id)).toBe(true);
  });

  it('survives an empty pack', () => {
    const snapshot = buildSnapshot({ pack, generatedAt: AT });
    expect(snapshot.docs).toEqual([]);
    expect(snapshot.files).toEqual([]);
  });
});

describe('referencedFileIds', () => {
  it('finds files referenced from a page block', () => {
    const snapshot = buildSnapshot({
      pack, docs: [page('d1', 'Overview', 0, assetNode('f1'))],
      files: [shelfFile('f1', 'Notice')], generatedAt: AT,
    });
    expect([...referencedFileIds(snapshot)]).toEqual(['f1']);
  });

  it('finds files referenced only from a table row', () => {
    // A file reachable ONLY from a chronology entry still has to be served, or
    // the recipient clicks an entry and gets nothing.
    const snapshot = buildSnapshot({
      pack,
      datasets: [{ id: 'ds1', key: 'chronology', title: 'C' }],
      records: [{ id: 'r1', dataset_id: 'ds1', fields: {}, document_id: 'f2' }],
      files: [shelfFile('f2', 'Survey')], generatedAt: AT,
    });
    expect([...referencedFileIds(snapshot)]).toEqual(['f2']);
  });

  it('finds files nested inside a toggle', () => {
    const toggle = {
      type: 'toggle', attrs: { uid: 't1' },
      content: [{ type: 'toggleBody', content: [assetNode('f3')] }],
    };
    const snapshot = buildSnapshot({
      pack, docs: [page('d1', 'Overview', 0, toggle)],
      files: [shelfFile('f3', 'Deep')], generatedAt: AT,
    });
    expect([...referencedFileIds(snapshot)]).toEqual(['f3']);
  });
});

describe('buildManifest', () => {
  const snapshot = () => buildSnapshot({
    pack,
    docs: [page('d1', 'Overview', 0, assetNode('f1'))],
    files: [shelfFile('f1', 'Notice'), shelfFile('f9', 'Unrelated')],
    generatedAt: AT,
  });

  it('lists ONLY files the content actually references', () => {
    // The heart of "gives no access to anything else": a shelf file nobody
    // referenced must not become reachable through a published link.
    const manifest = buildManifest(snapshot());

    expect(manifest.files.map(f => f.document_id)).toEqual(['f1']);
    expect(manifestAllows(manifest, 'f1')).toBe(true);
    expect(manifestAllows(manifest, 'f9')).toBe(false);
  });

  it('refuses an id it has never heard of', () => {
    const manifest = buildManifest(snapshot());
    expect(manifestAllows(manifest, 'not-a-file')).toBe(false);
    expect(manifestAllows(manifest, null)).toBe(false);
    expect(manifestAllows(manifest, undefined)).toBe(false);
    expect(manifestAllows({}, 'f1')).toBe(false);
  });

  it('carries the checksums the caller computed from the bytes', () => {
    const manifest = buildManifest(snapshot(), { f1: { checksum: 'abc123' } });
    expect(manifestEntry(manifest, 'f1').checksum).toBe('abc123');
  });

  it('records a null checksum rather than pretending one exists', () => {
    expect(manifestEntry(buildManifest(snapshot()), 'f1').checksum).toBeNull();
  });

  it('records the pinned copy, so the endpoint can prefer it', () => {
    // The pin is what makes a frozen publication genuinely immutable rather
    // than merely labelled so.
    const manifest = buildManifest(snapshot(), {
      f1: { checksum: 'abc123', pinned_file_id: 'drive-pinned-1' },
    });
    expect(manifestEntry(manifest, 'f1').pinned_file_id).toBe('drive-pinned-1');
  });

  it('records a null pin rather than pretending one exists', () => {
    // A follow-latest publication pins nothing, and a file that could not be
    // pinned must not look as though it was.
    expect(manifestEntry(buildManifest(snapshot()), 'f1').pinned_file_id).toBeNull();
  });

  it('reports a referenced file that has left the shelf', () => {
    // The author reviewing what they are about to send needs to see that a
    // page points at something the recipient will not receive.
    const withGap = buildSnapshot({
      pack, docs: [page('d1', 'Overview', 0, assetNode('gone'))],
      files: [], generatedAt: AT,
    });
    const manifest = buildManifest(withGap);

    expect(manifest.files).toEqual([]);
    expect(manifest.missing_file_ids).toEqual(['gone']);
  });

  it('carries the provider id, so the endpoint never takes one from the caller', () => {
    expect(manifestEntry(buildManifest(snapshot()), 'f1').provider_file_id)
      .toBe('drive-f1');
  });
});

describe('describeInclusion', () => {
  const snapshot = buildSnapshot({
    pack,
    docs: [page('d1', 'Overview', 0, assetNode('f1')), page('d2', 'Timeline', 1)],
    datasets: [{ id: 'ds1', key: 'chronology', title: 'Chronology' }],
    records: [
      { id: 'r1', dataset_id: 'ds1', fields: {} },
      { id: 'r2', dataset_id: 'ds1', fields: {} },
    ],
    files: [shelfFile('f1', 'Notice')],
    generatedAt: AT,
  });

  it('lists every page, table and file the link will expose', () => {
    // There is no redaction in v1 — the control is author diligence — so the
    // one thing owed to the author is a complete list before the link is issued.
    const review = describeInclusion(snapshot, buildManifest(snapshot));

    expect(review.pages.map(p => p.title)).toEqual(['Overview', 'Timeline']);
    expect(review.tables[0]).toMatchObject({ title: 'Chronology', records: 2 });
    expect(review.files.map(f => f.filename)).toEqual(['Notice']);
  });

  it('summarises in one line', () => {
    expect(describeInclusion(snapshot, buildManifest(snapshot)).summary)
      .toBe('2 pages · 1 table · 1 file');
  });

  it('surfaces files that will be missing for the recipient', () => {
    const broken = buildSnapshot({
      pack, docs: [page('d1', 'Overview', 0, assetNode('gone'))], generatedAt: AT,
    });
    expect(describeInclusion(broken, buildManifest(broken)).missing).toEqual(['gone']);
  });

  it('handles an empty pack without throwing', () => {
    const empty = buildSnapshot({ pack, generatedAt: AT });
    expect(describeInclusion(empty, buildManifest(empty)).summary)
      .toBe('0 pages · 0 tables · 0 files');
  });
});
