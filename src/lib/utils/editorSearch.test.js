// src/lib/utils/editorSearch.test.js

import { describe, it, expect } from 'vitest';
import { findRanges, stepIndex, describeMatches } from './editorSearch.js';

describe('findRanges', () => {
  it('finds every occurrence, with its offsets', () => {
    expect(findRanges('the cat sat on the mat', 'the'))
      .toEqual([{ from: 0, to: 3 }, { from: 15, to: 18 }]);
  });

  it('ignores case, because nobody typing into a find box means otherwise', () => {
    expect(findRanges('Fire Door', 'fire')).toEqual([{ from: 0, to: 4 }]);
    expect(findRanges('fire door', 'FIRE')).toEqual([{ from: 0, to: 4 }]);
  });

  it('does not return overlapping matches', () => {
    // "aa" in "aaa" is one match to anybody counting occurrences.
    expect(findRanges('aaa', 'aa')).toEqual([{ from: 0, to: 2 }]);
  });

  it('finds nothing for an empty query rather than everything', () => {
    expect(findRanges('anything', '')).toEqual([]);
    expect(findRanges('anything', null)).toEqual([]);
  });

  it('survives an empty document', () => {
    expect(findRanges('', 'x')).toEqual([]);
    expect(findRanges(null, 'x')).toEqual([]);
  });
});

describe('stepIndex', () => {
  it('starts at the first match going forwards, the last going back', () => {
    expect(stepIndex(5, -1, 1)).toBe(0);
    expect(stepIndex(5, -1, -1)).toBe(4);
  });

  it('wraps at both ends, so Enter always does something', () => {
    expect(stepIndex(3, 2, 1)).toBe(0);
    expect(stepIndex(3, 0, -1)).toBe(2);
  });

  it('has nowhere to go with no matches', () => {
    expect(stepIndex(0, -1, 1)).toBe(-1);
  });
});

describe('describeMatches', () => {
  it('counts from one, the way a person does', () => {
    expect(describeMatches(12, 2, 'door')).toBe('3 of 12');
  });

  it('says so when nothing matched', () => {
    // Silence would leave the reader unable to tell a search that found
    // nothing from one that has not run.
    expect(describeMatches(0, -1, 'zebra')).toBe('No matches');
  });

  it('says nothing when nobody is searching', () => {
    expect(describeMatches(0, -1, '')).toBe('');
    expect(describeMatches(0, -1, '   ')).toBe('');
  });
});
