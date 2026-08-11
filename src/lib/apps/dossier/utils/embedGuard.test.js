// src/lib/apps/dossier/utils/embedGuard.test.js
// Type-1 tests for transclusion guards. This is the one feature in the app that
// can hang a browser, so the degradation rules are pinned hard.

import { describe, it, expect } from 'vitest';
import {
  resolveEmbedRender, normaliseEmbedMode, firstParagraphText,
  MAX_EMBED_DEPTH, EMBED_MODES,
} from './embedGuard.js';

describe('normaliseEmbedMode', () => {
  it('passes through every declared mode', () => {
    for (const mode of EMBED_MODES) expect(normaliseEmbedMode(mode)).toBe(mode);
  });

  it('coerces anything unrecognised to full', () => {
    expect(normaliseEmbedMode('inline')).toBe('full');
    expect(normaliseEmbedMode('')).toBe('full');
    expect(normaliseEmbedMode(null)).toBe('full');
    expect(normaliseEmbedMode(undefined)).toBe('full');
  });
});

describe('resolveEmbedRender — the happy path', () => {
  it('honours the requested mode when nothing is wrong', () => {
    for (const mode of EMBED_MODES) {
      expect(resolveEmbedRender({ requested: mode, targetId: 'b', ancestry: ['a'] }))
        .toEqual({ mode, note: null });
    }
  });
});

describe('resolveEmbedRender — cycles', () => {
  it('degrades a direct cycle to a link card rather than looping', () => {
    // a embeds b, b embeds a.
    expect(resolveEmbedRender({ requested: 'full', targetId: 'a', ancestry: ['a', 'b'] }))
      .toEqual({ mode: 'link_card', note: 'cycle' });
  });

  it('catches a page embedding itself', () => {
    expect(resolveEmbedRender({ requested: 'full', targetId: 'a', ancestry: ['a'] }))
      .toEqual({ mode: 'link_card', note: 'cycle' });
  });

  it('catches an indirect cycle a→b→c→a', () => {
    expect(resolveEmbedRender({ requested: 'full', targetId: 'a', ancestry: ['a', 'b', 'c'] }))
      .toMatchObject({ note: 'cycle' });
  });

  it('does NOT treat the same page embedded twice side by side as a cycle', () => {
    // Two sibling embeds of the same page are legitimate — neither is inside
    // the other, so the ancestry never contains the target.
    expect(resolveEmbedRender({ requested: 'full', targetId: 'b', ancestry: ['a'] }))
      .toEqual({ mode: 'full', note: null });
  });

  it('reports cycle before depth when both apply', () => {
    // A cycle is the more useful explanation to show the reader.
    const deep = ['a', 'b', 'c', 'd'];
    expect(resolveEmbedRender({ requested: 'full', targetId: 'a', ancestry: deep }))
      .toMatchObject({ note: 'cycle' });
  });
});

describe('resolveEmbedRender — depth', () => {
  it('expands up to the cap', () => {
    const ancestry = Array.from({ length: MAX_EMBED_DEPTH - 1 }, (_, i) => `p${i}`);
    expect(resolveEmbedRender({ requested: 'full', targetId: 'target', ancestry }))
      .toMatchObject({ mode: 'full', note: null });
  });

  it('stops expanding at the cap', () => {
    const ancestry = Array.from({ length: MAX_EMBED_DEPTH }, (_, i) => `p${i}`);
    expect(resolveEmbedRender({ requested: 'full', targetId: 'target', ancestry }))
      .toEqual({ mode: 'link_card', note: 'depth' });
  });

  it('honours a caller-supplied cap', () => {
    expect(resolveEmbedRender({
      requested: 'full', targetId: 't', ancestry: ['a'], maxDepth: 1,
    })).toMatchObject({ note: 'depth' });
  });
});

describe('resolveEmbedRender — missing target', () => {
  it('shows a card so a stale reference stays visible', () => {
    // Silently dropping the embed would hide that the page ever referenced it.
    expect(resolveEmbedRender({
      requested: 'full', targetId: 'gone', ancestry: ['a'], exists: false,
    })).toEqual({ mode: 'link_card', note: 'missing' });
  });

  it('reports missing before cycle or depth', () => {
    expect(resolveEmbedRender({
      requested: 'full', targetId: 'a', ancestry: ['a'], exists: false,
    })).toMatchObject({ note: 'missing' });
  });
});

describe('firstParagraphText', () => {
  const doc = (...content) => ({ type: 'doc', content });
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

  it('takes the first paragraph with real text', () => {
    expect(firstParagraphText(doc(para('Hello there')))).toBe('Hello there');
  });

  it('skips a leading heading and empty paragraphs', () => {
    expect(firstParagraphText(doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph' },
      para('The real opening line'),
    ))).toBe('The real opening line');
  });

  it('joins marked runs into one line', () => {
    expect(firstParagraphText(doc({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'bold ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'and plain' },
      ],
    }))).toBe('bold and plain');
  });

  it('truncates with an ellipsis', () => {
    const out = firstParagraphText(doc(para('x'.repeat(400))), 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns empty for a page with no prose', () => {
    expect(firstParagraphText(doc())).toBe('');
    expect(firstParagraphText(doc({ type: 'horizontalRule' }))).toBe('');
    expect(firstParagraphText(null)).toBe('');
  });
});
