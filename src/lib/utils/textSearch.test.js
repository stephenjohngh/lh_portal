// src/lib/utils/textSearch.test.js
import { describe, it, expect } from 'vitest';
import { matchesSearch, searchWords, stripHtml, contains, snippetAround } from './textSearch.js';

describe('searchWords', () => {
  it('trims, lower-cases, folds accents and splits on any space', () => {
    expect(searchWords('  Fire   DOOR\t')).toEqual(['fire', 'door']);
    expect(searchWords('Café')).toEqual(['cafe']);
    expect(searchWords(null)).toEqual([]);
    expect(searchWords('   ')).toEqual([]);
  });
});

describe('matchesSearch', () => {
  const row = ['Fire door', 'L/FD/12', null, undefined, '', 42, ['Level 3', 'Stair B']];

  it('matches everything for an empty query', () => {
    expect(matchesSearch(row, '')).toBe(true);
    expect(matchesSearch(row, '   ')).toBe(true);
    expect(matchesSearch([], null)).toBe(true);
  });
  it('ignores case and surrounding spaces — "lift " still finds "Lift"', () => {
    expect(matchesSearch(['Lift motor room'], 'lift ')).toBe(true);
    expect(matchesSearch(['Lift motor room'], 'LIFT')).toBe(true);
  });
  it('finds words in any order', () => {
    expect(matchesSearch(['Door, fire rated'], 'fire door')).toBe(true);
  });
  it('lets each word come from a different field', () => {
    expect(matchesSearch(row, 'door stair')).toBe(true);
  });
  it('needs every word', () => {
    expect(matchesSearch(row, 'door basement')).toBe(false);
  });
  it('reads numbers as text and searches inside arrays', () => {
    expect(matchesSearch(row, '42')).toBe(true);
    expect(matchesSearch(row, 'level 3')).toBe(true);
  });
  it('never throws on a missing field, and never matches the word "null"', () => {
    expect(() => matchesSearch([null, undefined], 'x')).not.toThrow();
    expect(matchesSearch([null, undefined], 'null')).toBe(false);
    expect(matchesSearch(null, 'x')).toBe(false);
  });
  it('ignores accents both ways', () => {
    expect(matchesSearch(['Café on Level 1'], 'cafe')).toBe(true);
    expect(matchesSearch(['Cafe on Level 1'], 'café')).toBe(true);
  });
  it('does not match tag names once rich text is stripped', () => {
    const body = '<p>The <strong>fire</strong> door</p>';
    expect(matchesSearch([body], 'strong')).toBe(true);           // the fault
    expect(matchesSearch([stripHtml(body)], 'strong')).toBe(false);
    expect(matchesSearch([stripHtml(body)], 'fire door')).toBe(true);
  });
});

describe('the older helpers still behave', () => {
  it('contains and snippetAround', () => {
    expect(contains('Fire door', 'FIRE')).toBe(true);
    expect(contains('Fire door', '')).toBe(false);
    expect(snippetAround('a fire door', 'fire')).toMatchObject({ from: 2, to: 6 });
  });
});
