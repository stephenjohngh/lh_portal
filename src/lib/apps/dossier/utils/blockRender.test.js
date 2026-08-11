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
    expect(html).toContain('src="/api/media/file/drive1?mime=image%2Fjpeg"');
    expect(html).toContain('alt="Roof.jpg"');
  });

  it('renders a PDF as an open-in-new-tab card, never a frame', () => {
    // Four attempts at an inline frame failed across Firefox and Chrome; the
    // card always works and keeps user-uploaded bytes out of a frame entirely.
    const html = renderBlocksToHtml(asset({
      document_id: 'd2', filename: 'Notice.pdf',
      mime_type: 'application/pdf', provider_file_id: 'drive2',
    }));
    expect(html).toContain('Open PDF');
    expect(html).toContain('href="/api/media/file/drive2?mime=application%2Fpdf"');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<object');
  });

  it('gives an image a full-size link in its caption', () => {
    const html = renderBlocksToHtml(asset({
      document_id: 'd1', filename: 'Roof.jpg',
      mime_type: 'image/jpeg', provider_file_id: 'drive1',
    }));
    expect(html).toContain('href="/api/media/file/drive1?mime=image%2Fjpeg"');
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
    expect(html).toContain('href="/api/media/file/drive3"');  // no hint: not a declarable type
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

describe('sanitizeBlockHtml — the img allow-rule', () => {
  it('keeps an img whose src points at our own proxy', () => {
    expect(sanitizeBlockHtml('<img src="/api/media/file/abc">')).toContain('<img');
  });

  it('strips an img pointing anywhere else', () => {
    // An external image URL in a published pack would leak a reader's IP to a
    // third party the moment they opened it.
    expect(sanitizeBlockHtml('<img src="https://tracker.test/pixel.gif">')).not.toContain('<img');
  });

  it('admits no frame primitive at all', () => {
    expect(sanitizeBlockHtml('<iframe src="/api/media/file/abc"></iframe>')).not.toContain('<iframe');
    expect(sanitizeBlockHtml('<object data="/api/media/file/abc"></object>')).not.toContain('<object');
  });

  it('does not leave its hook installed for other callers', () => {
    // DOMPurify hooks are global — a leaked hook would silently change every
    // other sanitise call in the app.
    sanitizeBlockHtml('<img src="https://evil.test/x.png">');
    const after = DOMPurify.sanitize('<img src="https://example.test/a.png">');
    expect(after).toContain('<img');
  });
});

describe('transclusion', () => {
  const embed = (targetId, mode = 'full') => doc({
    type: 'embedDoc',
    attrs: { target_doc_id: targetId, render_mode: mode, target_title: 'Chronology' },
  });
  const page = (id, text) => ({ id, title: 'Chronology', blocks: doc(para(text)) });

  it('expands a full embed inline', () => {
    const html = renderBlocksToHtml(embed('d2'), { docs: [page('d2', 'Contract signed')] });
    expect(html).toContain('Contract signed');
    expect(html).toContain('data-embed-rendered="full"');
  });

  it('renders summary mode as title plus opening line only', () => {
    const html = renderBlocksToHtml(embed('d2', 'summary'),
      { docs: [page('d2', 'The opening line')] });
    expect(html).toContain('The opening line');
    expect(html).toContain('data-embed-rendered="summary"');
  });

  it('degrades a cycle to a link card instead of looping', () => {
    // d1 embeds d2; d2 embeds d1. Rendering d1 must terminate.
    const d1 = { id: 'd1', title: 'A', blocks: embed('d2') };
    const d2 = { id: 'd2', title: 'B', blocks: embed('d1') };
    const html = renderBlocksToHtml(d1.blocks, { docs: [d1, d2], ancestry: ['d1'] });
    expect(html).toContain('data-embed-note="cycle"');
    expect(html).toContain('would loop');
  });

  it('stops at the depth cap rather than expanding forever', () => {
    const chain = ['a', 'b', 'c', 'd', 'e'].map((id, i, all) => ({
      id, title: id.toUpperCase(),
      blocks: all[i + 1] ? embed(all[i + 1]) : doc(para('DEEPEST-PAGE-TEXT')),
    }));
    const html = renderBlocksToHtml(chain[0].blocks, { docs: chain });
    expect(html).toContain('data-embed-note="depth"');
    // The page past the cap is never expanded — note the substring must be
    // distinctive: 'end' also appears inside `data-embed-rendered`.
    expect(html).not.toContain('DEEPEST-PAGE-TEXT');
  });

  it('shows a card when the embedded page has been deleted', () => {
    // A non-empty docs list that simply lacks the target: an EMPTY list means
    // "no resolver supplied" and is left untouched (see the test below).
    const html = renderBlocksToHtml(embed('gone'), { docs: [page('other', 'x')] });
    expect(html).toContain('data-embed-note="missing"');
    expect(html).toContain('no longer exists');
  });

  it('escapes a page title rather than letting it inject markup', () => {
    const html = renderBlocksToHtml(embed('d2', 'summary'), {
      docs: [{ id: 'd2', title: '<img src=x onerror=alert(1)>', blocks: doc(para('x')) }],
    });
    // The title survives as inert TEXT, so the word "onerror" is still in the
    // string — what matters is that no <img> element was ever created from it.
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('leaves the placeholder alone when there is nothing to resolve against', () => {
    // The live editor renders without a docs list; the node view fills in there.
    const html = renderBlocksToHtml(embed('d2'));
    expect(html).toContain('data-embed-doc="d2"');
    expect(html).not.toContain('data-embed-rendered');
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
