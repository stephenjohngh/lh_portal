// src/lib/apps/dossier/utils/slug.test.js
// Type-1 pure-logic tests for doc slugs.

import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug } from './slug.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Key Issues')).toBe('key-issues');
  });

  it('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(slugify('14 Lonsdale House  —  dispute!!')).toBe('14-lonsdale-house-dispute');
  });

  it('keeps the base letter of an accented character', () => {
    // NFKD splits e-acute into 'e' + a combining mark; the mark is absorbed
    // into the adjacent separator run, so the 'e' survives.
    expect(slugify('Café dispute')).toBe('cafe-dispute');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  --Draft--  ')).toBe('draft');
  });

  it('falls back to untitled rather than returning an empty slug', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('!!!')).toBe('untitled');
    expect(slugify(null)).toBe('untitled');
    expect(slugify(undefined)).toBe('untitled');
  });

  it('truncates long titles without leaving a trailing hyphen', () => {
    const slug = slugify('a'.repeat(70) + ' ' + 'b'.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('returns the plain slug when it is free', () => {
    expect(uniqueSlug('Chronology', ['key-issues'])).toBe('chronology');
  });

  it('suffixes from 2 upward on collision', () => {
    expect(uniqueSlug('Chronology', ['chronology'])).toBe('chronology-2');
    expect(uniqueSlug('Chronology', ['chronology', 'chronology-2'])).toBe('chronology-3');
  });

  it('skips gaps rather than reusing a taken suffix', () => {
    expect(uniqueSlug('Chronology', ['chronology', 'chronology-3'])).toBe('chronology-2');
  });

  it('treats an empty title consistently with slugify', () => {
    expect(uniqueSlug('', ['untitled'])).toBe('untitled-2');
  });
});
