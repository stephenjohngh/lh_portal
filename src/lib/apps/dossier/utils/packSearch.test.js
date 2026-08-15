// src/lib/apps/dossier/utils/packSearch.test.js
// Searching a pack (merge doc D7, narrowed to within-a-pack).

import { describe, it, expect } from 'vitest';
import {
  blockTextRuns, snippetAround, searchPack, describeResults, MAX_RESULTS,
} from './packSearch.js';

const para = (uid, ...texts) => ({
  type: 'paragraph', attrs: { uid },
  content: texts.map(t => (typeof t === 'string' ? { type: 'text', text: t } : t)),
});
const bold = (text) => ({ type: 'text', text, marks: [{ type: 'bold' }] });
const doc = (...content) => ({ type: 'doc', content });

describe('blockTextRuns', () => {
  it('gives one run per block, carrying the block uid', () => {
    const runs = blockTextRuns(doc(para('u1', 'first'), para('u2', 'second')));
    expect(runs).toEqual([
      { uid: 'u1', text: 'first' },
      { uid: 'u2', text: 'second' },
    ]);
  });

  it('joins text split by a mark, so a phrase survives a bold word', () => {
    // "the notice was served" is three text nodes in ProseMirror. Searching the
    // nodes separately would fail to find the phrase that spans them.
    const runs = blockTextRuns(doc(para('u1', 'the ', bold('notice'), ' was served')));
    expect(runs).toEqual([{ uid: 'u1', text: 'the notice was served' }]);
  });

  it('reaches text nested inside a toggle or a list', () => {
    const nested = doc({
      type: 'toggle', attrs: { uid: 't1' },
      content: [{ type: 'toggleBody', content: [para('p1', 'buried detail')] }],
    });
    expect(blockTextRuns(nested).map(r => r.text)).toContain('buried detail');
  });

  it('collapses whitespace and drops empty blocks', () => {
    const runs = blockTextRuns(doc(para('u1', '  spaced   out  '), para('u2', '   ')));
    expect(runs).toEqual([{ uid: 'u1', text: 'spaced out' }]);
  });

  it('survives an absent or malformed doc', () => {
    expect(blockTextRuns(null)).toEqual([]);
    expect(blockTextRuns({})).toEqual([]);
  });
});

describe('snippetAround', () => {
  it('returns the offsets of the hit rather than markup', () => {
    // Building HTML here would mean escaping author text in a module with no
    // business doing it — the caller emphasises the range itself.
    const snip = snippetAround('the notice was served', 'notice');
    expect(snip.text.slice(snip.from, snip.to)).toBe('notice');
  });

  it('matches regardless of case', () => {
    expect(snippetAround('The Notice', 'notice')).not.toBeNull();
  });

  it('elides a long passage on both sides and keeps the offsets right', () => {
    const long = `${'a'.repeat(200)} needle ${'b'.repeat(200)}`;
    const snip = snippetAround(long, 'needle');

    expect(snip.text.startsWith('…')).toBe(true);
    expect(snip.text.endsWith('…')).toBe(true);
    expect(snip.text.slice(snip.from, snip.to)).toBe('needle');
  });

  it('is null when there is no hit', () => {
    expect(snippetAround('nothing here', 'zzz')).toBeNull();
  });
});

describe('searchPack', () => {
  const content = {
    docs: [
      { id: 'd1', title: 'Overview', blocks: doc(para('b1', 'The service charge dispute')) },
      { id: 'd2', title: 'Service charge history', blocks: doc(para('b2', 'Nothing relevant')) },
    ],
    datasets: [
      { id: 's1', key: 'chronology',     title: 'Chronology' },
      { id: 's2', key: 'correspondence', title: 'Correspondence' },
    ],
    records: [
      { id: 'r1', dataset_id: 's1', fields: { date: '2026-01-04', event: 'Service charge demand issued' } },
      { id: 'r2', dataset_id: 's1', fields: { date: '2026-02-01', event: 'Nothing to see' } },
      { id: 'r3', dataset_id: 's2', fields: { subject: 'Re: fees', body: 'the service charge is disputed' } },
    ],
  };

  it('finds a phrase in a page-s prose', () => {
    const results = searchPack(content, 'service charge');
    const page = results.find(r => r.kind === 'page' && r.where === 'On this page');

    expect(page.docId).toBe('d1');
    expect(page.blockUid).toBe('b1');
  });

  it('finds a page by its name, and says so', () => {
    const results = searchPack(content, 'service charge');
    const byName = results.find(r => r.where === 'Page name');

    expect(byName.docId).toBe('d2');
  });

  it('searches table entries — the thing a reader is usually scanning for', () => {
    // A search that ignored the chronology would answer "when did we first
    // write to them?" wrongly, which is worse than not answering.
    const results = searchPack(content, 'service charge');
    const entry = results.find(r => r.kind === 'entry' && r.datasetId === 's1');

    expect(entry.title).toBe('Chronology');
    expect(entry.where).toBe('Event');
  });

  it('searches a field that renders on its own line, not just the columns', () => {
    // A correspondence body is laid out beneath its row rather than as a
    // column, and is the most searchable thing in the row.
    const results = searchPack(content, 'disputed');
    expect(results.find(r => r.datasetId === 's2')?.where).toBe('Message');
  });

  it('reports a row once, however many of its columns match', () => {
    const twice = {
      datasets: [{ id: 's1', key: 'chronology', title: 'C' }],
      records: [{ id: 'r1', dataset_id: 's1',
        fields: { event: 'notice served', significance: 'the notice matters' } }],
    };
    expect(searchPack(twice, 'notice')).toHaveLength(1);
  });

  it('ignores a record whose table is not in the pack', () => {
    const orphan = { datasets: [], records: [{ id: 'r', dataset_id: 'gone', fields: { event: 'x' } }] };
    expect(searchPack(orphan, 'x')).toEqual([]);
  });

  it('refuses a query too short to be useful', () => {
    // One character matches most of a pack and helps nobody.
    expect(searchPack(content, 'a')).toEqual([]);
    expect(searchPack(content, '  ')).toEqual([]);
  });

  it('caps the result count', () => {
    const many = {
      docs: Array.from({ length: 200 }, (_, i) => ({
        id: `d${i}`, title: 'x', blocks: doc(para(`b${i}`, 'needle')),
      })),
    };
    expect(searchPack(many, 'needle')).toHaveLength(MAX_RESULTS);
  });

  it('searches nothing outside what it was given', () => {
    // The narrowing that D7 turned on: a pack searches its own content. There
    // is no path from here to another pack.
    expect(searchPack({}, 'anything')).toEqual([]);
  });
});

describe('describeResults', () => {
  it('never leaves an empty panel unexplained', () => {
    expect(describeResults([], 'zzz')).toContain('Nothing in this pack');
    expect(describeResults([], 'z')).toContain('at least 2');
  });

  it('counts pages and entries separately', () => {
    const results = [
      { kind: 'page', docId: 'd1' }, { kind: 'page', docId: 'd1' },
      { kind: 'entry', datasetId: 's1' },
    ];
    expect(describeResults(results, 'fee')).toBe('3 results in 1 page and 1 table entry.');
  });
});
