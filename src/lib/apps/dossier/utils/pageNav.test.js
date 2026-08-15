// src/lib/apps/dossier/utils/pageNav.test.js
// Getting around a pack: outline, reading time, deep-link fragments.

import { describe, it, expect } from 'vitest';
import {
  pageOutline, outlineDepths, wordCount, describeReadingTime, packReadingTime,
  docIdFromHash, decodeFragment, hashForDoc, WORDS_PER_MINUTE,
} from './pageNav.js';

const heading = (uid, level, text) => ({
  type: 'heading', attrs: { uid, level }, content: [{ type: 'text', text }],
});
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content) => ({ type: 'doc', content });

describe('pageOutline', () => {
  it('lists the headings in document order, with their anchors', () => {
    const outline = pageOutline(doc(
      heading('h1', 1, 'Overview'),
      para('some prose'),
      heading('h2', 2, 'Background'),
    ));

    expect(outline).toEqual([
      { uid: 'h1', level: 1, text: 'Overview' },
      { uid: 'h2', level: 2, text: 'Background' },
    ]);
  });

  it('ignores everything that is not a heading', () => {
    // A paragraph is addressable but is not a landmark; an outline listing
    // every block is a second copy of the page.
    expect(pageOutline(doc(para('one'), para('two')))).toEqual([]);
  });

  it('finds a heading nested inside a toggle or a callout', () => {
    const nested = doc({
      type: 'toggle', attrs: { uid: 't1' },
      content: [{ type: 'toggleBody', content: [heading('h9', 2, 'Buried')] }],
    });
    expect(pageOutline(nested).map(h => h.text)).toEqual(['Buried']);
  });

  it('joins a heading split by a mark', () => {
    const marked = doc({
      type: 'heading', attrs: { uid: 'h1', level: 2 },
      content: [
        { type: 'text', text: 'The ' },
        { type: 'text', text: 'notice', marks: [{ type: 'bold' }] },
      ],
    });
    expect(pageOutline(marked)[0].text).toBe('The notice');
  });

  it('drops an empty heading — a landmark to nowhere', () => {
    expect(pageOutline(doc({ type: 'heading', attrs: { uid: 'h1', level: 1 } }))).toEqual([]);
  });

  it('clamps a level outside what the schema offers', () => {
    expect(pageOutline(doc(heading('h1', 9, 'Deep')))[0].level).toBe(3);
    expect(pageOutline(doc(heading('h1', 0, 'Shallow')))[0].level).toBe(1);
  });

  it('survives an absent page', () => {
    expect(pageOutline(null)).toEqual([]);
  });
});

describe('outlineDepths', () => {
  it('indents relative to the page-s own shallowest heading', () => {
    // A page written entirely in h2 should render flush. Punishing an author
    // for not starting at h1 makes the outline look broken.
    const depths = outlineDepths([
      { level: 2, text: 'a' }, { level: 3, text: 'b' }, { level: 2, text: 'c' },
    ]).map(h => h.depth);

    expect(depths).toEqual([0, 1, 0]);
  });

  it('is empty for an empty outline', () => {
    expect(outlineDepths([])).toEqual([]);
  });
});

describe('wordCount / describeReadingTime', () => {
  it('counts the words of a page, whatever the blocks', () => {
    expect(wordCount(doc(para('one two three'), heading('h', 1, 'four five')))).toBe(5);
  });

  it('is zero for an empty page', () => {
    expect(wordCount(doc())).toBe(0);
    expect(wordCount(null)).toBe(0);
  });

  it('says nothing at all when there is nothing to read', () => {
    // An empty page should not announce "under a minute" — it should be silent.
    expect(describeReadingTime(0)).toBe('');
  });

  it('does not claim a precision it does not have', () => {
    expect(describeReadingTime(50)).toBe('under a minute to read');
    expect(describeReadingTime(WORDS_PER_MINUTE)).toBe('about 1 minute to read');
    expect(describeReadingTime(WORDS_PER_MINUTE * 12)).toBe('about 12 minutes to read');
  });

  it('totals the whole pack, which is what the recipient wants first', () => {
    const docs = [
      { blocks: doc(para(new Array(WORDS_PER_MINUTE).fill('word').join(' '))) },
      { blocks: doc(para(new Array(WORDS_PER_MINUTE).fill('word').join(' '))) },
    ];
    expect(packReadingTime(docs)).toBe('about 2 minutes to read');
  });

  it('says nothing for a pack with no pages', () => {
    expect(packReadingTime([])).toBe('');
  });
});

describe('deep-link fragments', () => {
  const docs = [
    { id: 'd1', slug: 'overview' },
    { id: 'd2', slug: 'service-charge' },
  ];

  it('resolves a fragment to a page', () => {
    expect(docIdFromHash('#service-charge', docs)).toBe('d2');
    expect(docIdFromHash('service-charge', docs)).toBe('d2');
  });

  it('tolerates encoding, because the link arrives from an email client', () => {
    expect(docIdFromHash('#service%2Dcharge', docs)).toBe('d2');
  });

  it('is null for no fragment, and for one naming no page', () => {
    // A stale link should open the pack, not an error.
    expect(docIdFromHash('', docs)).toBeNull();
    expect(docIdFromHash('#', docs)).toBeNull();
    expect(docIdFromHash('#deleted-page', docs)).toBeNull();
  });

  it('does not fall over on a malformed escape', () => {
    expect(() => docIdFromHash('#%E0%A4%A', docs)).not.toThrow();
  });

  it('builds the fragment from the slug, never from the id', () => {
    // The slug is readable, survives a rename, and does not hand a database id
    // to a recipient.
    expect(hashForDoc({ id: 'd2', slug: 'service-charge' })).toBe('#service-charge');
    expect(hashForDoc(null)).toBe('');
    expect(hashForDoc({ id: 'd3' })).toBe('');
  });

  it('round-trips a slug needing encoding', () => {
    const hash = hashForDoc({ slug: 'a b' });
    expect(decodeFragment(hash)).toBe('a b');
  });
});
