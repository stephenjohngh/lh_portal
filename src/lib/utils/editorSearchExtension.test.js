// src/lib/utils/editorSearchExtension.test.js
// The ProseMirror half — built on a real schema, because the thing worth
// testing is precisely what a plain string search cannot do.

import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { textWithPositions, matchRanges } from './editorSearchExtension.js';

const schema = getSchema([StarterKit]);
const doc = (json) => schema.nodeFromJSON(json);

const para = (...content) => ({ type: 'paragraph', content });
const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });

describe('textWithPositions', () => {
  it('gives every character a position in the document', () => {
    const node = doc({ type: 'doc', content: [para(text('abc'))] });
    const { text: flat, positions } = textWithPositions(node);

    expect(flat).toBe('abc');
    expect(positions).toHaveLength(3);
    // Positions are ProseMirror's, not string offsets: the first character of
    // the first paragraph sits at 1, after the paragraph's own opening token.
    expect(positions[0]).toBe(1);
    expect(positions[2]).toBe(3);
  });

  it('separates blocks, so two paragraphs do not fuse into a false match', () => {
    const node = doc({ type: 'doc', content: [para(text('red')), para(text('herring'))] });
    expect(textWithPositions(node).text).toBe('red\nherring');
    expect(matchRanges(node, 'redherring')).toEqual([]);
  });
});

describe('matchRanges', () => {
  it('finds a phrase BROKEN BY FORMATTING, which is the whole point', () => {
    // "the fire door" with "fire" in bold is three text nodes. Searching them
    // one at a time cannot find the phrase — it exists in none of them.
    const node = doc({ type: 'doc', content: [para(
      text('the '), text('fire', [{ type: 'bold' }]), text(' door'),
    )] });

    const [range] = matchRanges(node, 'the fire door');
    expect(range).toBeDefined();
    expect(node.textBetween(range.from, range.to)).toBe('the fire door');
  });

  it('returns a range that covers exactly the match', () => {
    const node = doc({ type: 'doc', content: [para(text('a roof leak here'))] });
    const [range] = matchRanges(node, 'roof leak');
    expect(node.textBetween(range.from, range.to)).toBe('roof leak');
  });

  it('finds every occurrence across blocks', () => {
    const node = doc({ type: 'doc', content: [
      para(text('door one')), para(text('door two')),
    ] });
    const ranges = matchRanges(node, 'door');
    expect(ranges).toHaveLength(2);
    expect(ranges.map(r => node.textBetween(r.from, r.to))).toEqual(['door', 'door']);
  });

  it('finds nothing for an empty query', () => {
    const node = doc({ type: 'doc', content: [para(text('anything'))] });
    expect(matchRanges(node, '')).toEqual([]);
  });
});
