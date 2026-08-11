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
const { default: DOMPurify } = await import('dompurify');

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

describe('asset blocks', () => {
  const asset = (attrs) => doc({ type: 'asset', attrs });

  it('renders an image through the file proxy', () => {
    const html = renderBlocksToHtml(asset({
      document_id: 'd1', filename: 'Roof.jpg',
      mime_type: 'image/jpeg', provider_file_id: 'drive1',
    }));
    expect(html).toContain('src="/api/media/file/drive1"');
    expect(html).toContain('alt="Roof.jpg"');
  });

  it('renders a PDF as a SANDBOXED iframe pointing at the proxy', () => {
    // Not <object>: the portal CSP sets object-src 'none'. Sandbox matters
    // because these are user-uploaded bytes on our own origin.
    const html = renderBlocksToHtml(asset({
      document_id: 'd2', filename: 'Notice.pdf',
      mime_type: 'application/pdf', provider_file_id: 'drive2',
    }));
    expect(html).toContain('<iframe');
    expect(html).toContain('src="/api/media/file/drive2"');
    expect(html).toContain('sandbox');
    expect(html).not.toContain('<object');
  });

  it('gives an image a full-size link in its caption', () => {
    const html = renderBlocksToHtml(asset({
      document_id: 'd1', filename: 'Roof.jpg',
      mime_type: 'image/jpeg', provider_file_id: 'drive1',
    }));
    expect(html).toContain('href="/api/media/file/drive1"');
    expect(html).toContain('view full size');
  });

  it('renders anything else as a download card', () => {
    const html = renderBlocksToHtml(asset({
      document_id: 'd3', filename: 'Schedule.xlsx', size_bytes: 2048,
      mime_type: 'application/vnd.ms-excel', provider_file_id: 'drive3',
    }));
    expect(html).toContain('dossier-asset-card');
    expect(html).toContain('Schedule.xlsx');
    expect(html).toContain('2.0 KB');
    expect(html).toContain('href="/api/media/file/drive3"');
  });

  it('degrades to a card with no link when the provider id is unusable', () => {
    // e.g. a path-shaped Supabase id, which the proxy would reject anyway.
    const html = renderBlocksToHtml(asset({
      document_id: 'd4', filename: 'Old.png',
      mime_type: 'image/png', provider_file_id: 'packs/old.png',
    }));
    expect(html).toContain('dossier-asset-card');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href=');
  });

  it('keeps the document_id — the link graph and publish walk follow it', () => {
    const html = renderBlocksToHtml(asset({
      document_id: 'd5', filename: 'x', mime_type: 'text/plain', provider_file_id: 'p5',
    }));
    expect(html).toContain('data-document_id="d5"');
  });
});

describe('sanitizeBlockHtml — the iframe/img allow-rule', () => {
  it('keeps an iframe whose src points at our own proxy', () => {
    const html = sanitizeBlockHtml('<iframe src="/api/media/file/abc"></iframe>');
    expect(html).toContain('<iframe');
  });

  it('re-asserts the sandbox even if the stored HTML dropped it', () => {
    // This layer sees what actually reaches the page, so it does not trust the
    // stored markup to have been generated by the current code.
    const html = sanitizeBlockHtml('<iframe src="/api/media/file/abc"></iframe>');
    expect(html).toContain('sandbox=""');
  });

  it('strips an iframe pointing anywhere else', () => {
    // An unconstrained iframe would be a general-purpose embed primitive in the
    // one feature built to be handed to an outsider.
    for (const bad of [
      '<iframe src="https://evil.test/x"></iframe>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<iframe src="/api/media/file/../../secret"></iframe>',
      '<iframe></iframe>',
    ]) {
      expect(sanitizeBlockHtml(bad)).not.toContain('<iframe');
    }
  });

  it('never admits an object — the CSP blocks it anyway', () => {
    expect(sanitizeBlockHtml('<object data="/api/media/file/abc"></object>'))
      .not.toContain('<object');
  });

  it('strips an img pointing outside the proxy', () => {
    expect(sanitizeBlockHtml('<img src="/api/media/file/abc">')).toContain('<img');
    expect(sanitizeBlockHtml('<img src="https://tracker.test/pixel.gif">')).not.toContain('<img');
  });

  it('does not leave its hook installed for other callers', () => {
    // DOMPurify hooks are global — a leaked hook would silently change every
    // other sanitise call in the app.
    sanitizeBlockHtml('<object data="https://evil.test/x"></object>');
    const after = DOMPurify.sanitize('<img src="https://example.test/a.png">');
    expect(after).toContain('<img');
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
