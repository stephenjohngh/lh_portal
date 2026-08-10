// @vitest-environment jsdom
// src/lib/apps/dossier/utils/blockRender.test.js
//
// jsdom is required: generateHTML serialises through a real DOM, and DOMPurify
// needs a window. blocksToText is DOM-free but lives here with its siblings.

import { describe, it, expect, vi } from 'vitest';

// logger transitively imports $app/environment, which does not resolve without
// the SvelteKit vite plugin — the house pattern is to mock the seam.
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { renderBlocksToHtml, sanitizeBlockHtml, blocksToText } = await import('./blockRender.js');

const doc = (...content) => ({ type: 'doc', content });
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('renderBlocksToHtml', () => {
  it('renders paragraphs and marks', () => {
    const html = renderBlocksToHtml(doc(para('Hello')));
    expect(html).toContain('Hello');
    expect(html).toContain('<p');
  });

  it('renders headings and lists', () => {
    const html = renderBlocksToHtml(doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Issues' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [para('One')] },
      ] },
    ));
    expect(html).toContain('<h2');
    expect(html).toContain('<ul');
    expect(html).toContain('One');
  });

  it('keeps the data attributes a callout is styled by', () => {
    // The variant drives the icon and colour in CSS — if the sanitiser strips
    // data-*, every callout silently renders as a plain box.
    const html = renderBlocksToHtml(doc(
      { type: 'callout', attrs: { variant: 'warning' }, content: [para('Key issue')] },
    ));
    expect(html).toContain('data-callout');
    expect(html).toContain('data-variant="warning"');
  });

  it('keeps the toggle structure and its open state', () => {
    const html = renderBlocksToHtml(doc({
      type: 'toggle',
      attrs: { open: false },
      content: [
        { type: 'toggleSummary', content: [{ type: 'text', text: 'Detail' }] },
        { type: 'toggleBody', content: [para('Hidden')] },
      ],
    }));
    expect(html).toContain('data-toggle');
    expect(html).toContain('data-open="false"');
    expect(html).toContain('data-toggle-summary');
    expect(html).toContain('data-toggle-body');
  });

  it('preserves block uids — deep links resolve through them', () => {
    const html = renderBlocksToHtml(doc(
      { type: 'paragraph', attrs: { uid: 'blk-1' }, content: [{ type: 'text', text: 'x' }] },
    ));
    expect(html).toContain('data-uid="blk-1"');
  });

  it('returns empty string for an empty or missing doc', () => {
    expect(renderBlocksToHtml(doc())).toBe('');
    expect(renderBlocksToHtml(null)).toBe('');
    expect(renderBlocksToHtml(undefined)).toBe('');
  });

  it('returns empty string rather than throwing on unrenderable JSON', () => {
    // Stored JSON that no longer matches the schema must not take a published
    // pack down — the caller distinguishes empty from broken.
    expect(() => renderBlocksToHtml({ type: 'doc', content: [{ type: 'nope' }] })).not.toThrow();
    expect(renderBlocksToHtml({ type: 'doc', content: [{ type: 'nope' }] })).toBe('');
  });
});

describe('sanitizeBlockHtml', () => {
  it('strips script tags and event handlers', () => {
    const dirty = '<p onclick="steal()">hi</p><script>steal()</script>';
    const clean = sanitizeBlockHtml(dirty);
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('hi');
  });

  it('keeps links but not javascript: URLs', () => {
    expect(sanitizeBlockHtml('<a href="https://x.test">x</a>')).toContain('href="https://x.test"');
    expect(sanitizeBlockHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
  });

  it('keeps data attributes', () => {
    expect(sanitizeBlockHtml('<div data-callout data-variant="info">x</div>'))
      .toContain('data-variant="info"');
  });

  it('handles empty input', () => {
    expect(sanitizeBlockHtml('')).toBe('');
    expect(sanitizeBlockHtml(null)).toBe('');
  });
});

describe('blocksToText', () => {
  it('flattens nested text in document order', () => {
    expect(blocksToText(doc(para('One'), para('Two')))).toBe('One Two');
  });

  it('reaches text inside containers', () => {
    expect(blocksToText(doc({
      type: 'callout', content: [para('Inside')],
    }))).toBe('Inside');
  });

  it('collapses whitespace and truncates with an ellipsis', () => {
    const long = blocksToText(doc(para('x'.repeat(400))), 20);
    expect(long.length).toBeLessThanOrEqual(21);   // 20 + ellipsis
    expect(long.endsWith('…')).toBe(true);
  });

  it('returns an empty string for an empty or missing doc', () => {
    expect(blocksToText(doc())).toBe('');
    expect(blocksToText(null)).toBe('');
  });
});
