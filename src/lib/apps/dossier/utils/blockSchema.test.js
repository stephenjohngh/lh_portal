// src/lib/apps/dossier/utils/blockSchema.test.js
// Type-1 tests for the pure surfaces of the schema module. The node specs
// themselves are declarative and exercised by the build; what is worth pinning
// is the variant coercion (a bad variant must never reach storage) and the
// empty-doc predicate.

import { describe, it, expect } from 'vitest';
import { ADDRESSABLE_TYPES, EMPTY_DOC, isEmptyDoc } from './blockSchema.js';
import { CALLOUT_VARIANTS, normaliseVariant } from './calloutNode.js';

describe('normaliseVariant', () => {
  it('passes through every declared variant', () => {
    for (const v of CALLOUT_VARIANTS) {
      expect(normaliseVariant(v.value)).toBe(v.value);
    }
  });

  it('coerces anything unrecognised to info', () => {
    // Stored docs must never carry a variant the CSS has no rule for.
    expect(normaliseVariant('danger')).toBe('info');
    expect(normaliseVariant('')).toBe('info');
    expect(normaliseVariant(null)).toBe('info');
    expect(normaliseVariant(undefined)).toBe('info');
    expect(normaliseVariant(42)).toBe('info');
  });

  it('declares the three variants from the spec', () => {
    expect(CALLOUT_VARIANTS.map(v => v.value)).toEqual(['info', 'warning', 'success']);
  });
});

describe('ADDRESSABLE_TYPES', () => {
  it('includes the new container blocks so they get stable ids', () => {
    expect(ADDRESSABLE_TYPES).toContain('callout');
    expect(ADDRESSABLE_TYPES).toContain('toggle');
  });

  it('excludes the toggle halves and list items — they are not link targets', () => {
    expect(ADDRESSABLE_TYPES).not.toContain('toggleSummary');
    expect(ADDRESSABLE_TYPES).not.toContain('toggleBody');
    expect(ADDRESSABLE_TYPES).not.toContain('listItem');
  });
});

describe('isEmptyDoc', () => {
  it('treats the default document as empty', () => {
    expect(isEmptyDoc(EMPTY_DOC)).toBe(true);
    expect(isEmptyDoc({ type: 'doc', content: [] })).toBe(true);
  });

  it('treats a doc of empty paragraphs as empty', () => {
    // Tiptap seeds a blank editor with one empty paragraph.
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(isEmptyDoc({
      type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [] }],
    })).toBe(true);
  });

  it('treats any real content as non-empty', () => {
    expect(isEmptyDoc({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    })).toBe(false);
  });

  it('treats a structural block with no text as non-empty', () => {
    // A divider, callout or toggle is content even with nothing typed in it.
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'horizontalRule' }] })).toBe(false);
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'callout' }] })).toBe(false);
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'toggle' }] })).toBe(false);
  });

  it('tolerates malformed input', () => {
    expect(isEmptyDoc(null)).toBe(true);
    expect(isEmptyDoc(undefined)).toBe(true);
    expect(isEmptyDoc({})).toBe(true);
  });
});
