// src/lib/apps/dossier/utils/brokenRefs.test.js
// Type-1 tests for broken-reference detection.

import { describe, it, expect } from 'vitest';
import { findBrokenReferences, describeBrokenReferences } from './brokenRefs.js';

const docs  = [{ id: 'd1', title: 'Overview' }, { id: 'd2', title: 'Chronology' }];
const files = [{ id: 'f1' }];

const docLink = (over = {}) => ({
  from_doc_id: 'd1', from_block_id: 'b1', target_kind: 'doc',
  target_doc_id: 'd2', target_doc_ref: 'chronology', ...over,
});
const assetLink = (over = {}) => ({
  from_doc_id: 'd1', from_block_id: 'b2', target_kind: 'asset',
  target_document_id: 'f1', ...over,
});

describe('findBrokenReferences — pages', () => {
  it('reports nothing when every reference resolves', () => {
    expect(findBrokenReferences([docLink(), assetLink()], docs, files)).toEqual([]);
  });

  it('catches a link whose FK was nulled by the delete', () => {
    // migration 174 uses ON DELETE SET NULL precisely so this stays visible.
    const broken = findBrokenReferences([docLink({ target_doc_id: null })], docs, files);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({
      kind: 'doc', reason: 'deleted-page', from_block_id: 'b1',
      origin: { type: 'page', id: 'd1', title: 'Overview' },
    });
  });

  it('names the deleted page by its slug — the only name that survives', () => {
    const broken = findBrokenReferences(
      [docLink({ target_doc_id: null, target_doc_ref: 'key-issues' })], docs, files);
    expect(broken[0].label).toBe('key-issues');
  });

  it('catches a target id that no longer resolves even with the FK intact', () => {
    const broken = findBrokenReferences([docLink({ target_doc_id: 'gone' })], docs, files);
    expect(broken).toHaveLength(1);
  });

  it('falls back to a readable label when there is no slug either', () => {
    const broken = findBrokenReferences(
      [docLink({ target_doc_id: null, target_doc_ref: null })], docs, files);
    expect(broken[0].label).toBe('a deleted page');
  });
});

describe('findBrokenReferences — files', () => {
  it('catches a file removed from the shelf', () => {
    // The exact case reported during testing: deleting a file left its block
    // behind, pointing at nothing.
    const broken = findBrokenReferences([assetLink({ target_document_id: 'gone' })], docs, files);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ kind: 'asset', reason: 'missing-file' });
  });

  it('catches a file deleted from the shared library outside Dossier', () => {
    // No FK can prevent this — document_library is shared infrastructure.
    expect(findBrokenReferences([assetLink()], docs, [])).toHaveLength(1);
  });
});

describe('findBrokenReferences — presentation', () => {
  it('sorts by page then label so the list is stable between loads', () => {
    const broken = findBrokenReferences([
      { from_doc_id: 'd2', target_kind: 'doc', target_doc_id: null, target_doc_ref: 'zebra' },
      { from_doc_id: 'd1', target_kind: 'doc', target_doc_id: null, target_doc_ref: 'alpha' },
      { from_doc_id: 'd2', target_kind: 'doc', target_doc_id: null, target_doc_ref: 'alpha' },
    ], docs, files);
    expect(broken.map(b => `${b.origin.title}/${b.label}`))
      .toEqual(['Chronology/alpha', 'Chronology/zebra', 'Overview/alpha']);
  });

  it('handles empty input', () => {
    expect(findBrokenReferences([], docs, files)).toEqual([]);
    expect(findBrokenReferences()).toEqual([]);
  });
});

describe('describeBrokenReferences', () => {
  it('counts references and the pages they sit on', () => {
    const broken = [
      { origin: { type: 'page', id: 'd1' } },
      { origin: { type: 'page', id: 'd1' } },
      { origin: { type: 'table', id: 'ds1' } },
    ];
    expect(describeBrokenReferences(broken)).toBe('3 broken references in 2 places');
  });

  it('uses the singular where it should', () => {
    expect(describeBrokenReferences([{ origin: { type: 'page', id: 'd1' } }]))
      .toBe('1 broken reference in 1 place');
  });

  it('says nothing when everything resolves', () => {
    expect(describeBrokenReferences([])).toBe('');
  });
});
