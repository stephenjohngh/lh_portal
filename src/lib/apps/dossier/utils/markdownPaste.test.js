// src/lib/apps/dossier/utils/markdownPaste.test.js
// Reading markdown back into a page — the other half of the archive.
//
// The round trip is the point: what packArchive.js writes out, this reads back.
// So several of these use the exact shapes that module emits.

import { describe, it, expect } from 'vitest';
import {
  markdownToHtml, inlineMarkdown, escapeHtml, looksLikeMarkdown, internalSlug,
} from './markdownPaste.js';
import { blocksToMarkdown } from './packArchive.js';

describe('markdownToHtml — blocks', () => {
  it('reads headings, clamping to what the schema allows', () => {
    // The editor offers h1-h3; a deeper heading should arrive as the closest
    // thing rather than vanishing.
    expect(markdownToHtml('# One')).toBe('<h1>One</h1>');
    expect(markdownToHtml('### Three')).toBe('<h3>Three</h3>');
    expect(markdownToHtml('##### Five')).toBe('<h3>Five</h3>');
  });

  it('joins wrapped lines into one paragraph, and splits on a blank line', () => {
    expect(markdownToHtml('one\ntwo\n\nthree'))
      .toBe('<p>one two</p><p>three</p>');
  });

  it('reads a bulleted list', () => {
    expect(markdownToHtml('- first\n- second'))
      .toBe('<ul><li><p>first</p></li><li><p>second</p></li></ul>');
  });

  it('reads a numbered list', () => {
    expect(markdownToHtml('1. first\n2. second'))
      .toBe('<ol><li><p>first</p></li><li><p>second</p></li></ol>');
  });

  it('nests an indented list inside its parent', () => {
    const html = markdownToHtml('- top\n  - under\n- back');
    expect(html).toBe(
      '<ul><li><p>top</p></li><ul><li><p>under</p></li></ul><li><p>back</p></li></ul>');
  });

  it('starts a new list when the kind changes', () => {
    const html = markdownToHtml('- bullet\n1. number');
    expect(html).toBe('<ul><li><p>bullet</p></li></ul><ol><li><p>number</p></li></ol>');
  });

  it('does not read a horizontal rule as a bullet', () => {
    expect(markdownToHtml('---')).toBe('<hr>');
    expect(markdownToHtml('***')).toBe('<hr>');
  });

  it('reads a blockquote, merging its lines', () => {
    expect(markdownToHtml('> one\n> two'))
      .toBe('<blockquote><p>one two</p></blockquote>');
  });

  it('keeps a fenced code block literal, blank lines and all', () => {
    const html = markdownToHtml('```\nline one\n\n  indented\n```');
    expect(html).toBe('<pre><code>line one\n\n  indented</code></pre>');
  });

  it('does not mark up markdown INSIDE a code fence', () => {
    expect(markdownToHtml('```\n**not bold**\n```'))
      .toBe('<pre><code>**not bold**</code></pre>');
  });

  it('closes an unterminated fence rather than dropping its contents', () => {
    expect(markdownToHtml('```\nstranded')).toBe('<pre><code>stranded</code></pre>');
  });

  it('renders an unrecognised line as a paragraph rather than losing it', () => {
    expect(markdownToHtml('| a | b |')).toBe('<p>| a | b |</p>');
  });

  it('is empty for empty input', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml(null)).toBe('');
  });
});

describe('markdownToHtml — the author-s own blank lines', () => {
  it('treats one blank line as an ordinary block separator', () => {
    expect(markdownToHtml('one\n\ntwo')).toBe('<p>one</p><p>two</p>');
  });

  it('returns every blank line beyond the first as an empty paragraph', () => {
    // Spacing somebody arranged is part of the page, not whitespace to tidy.
    expect(markdownToHtml('one\n\n\n\ntwo'))
      .toBe('<p>one</p><p></p><p></p><p>two</p>');
  });

  it('ignores blank lines at the very start of a paste', () => {
    // Whitespace around a paste, not a layout choice.
    expect(markdownToHtml('\n\n\nfirst')).toBe('<p>first</p>');
  });

  it('does not count blank lines inside a code fence', () => {
    expect(markdownToHtml('```\na\n\n\nb\n```'))
      .toBe('<pre><code>a\n\n\nb</code></pre>');
  });
});

describe('markdownToHtml — inline', () => {
  it('reads the marks the editor has', () => {
    expect(markdownToHtml('**bold**')).toBe('<p><strong>bold</strong></p>');
    expect(markdownToHtml('*italic*')).toBe('<p><em>italic</em></p>');
    expect(markdownToHtml('_italic_')).toBe('<p><em>italic</em></p>');
    expect(markdownToHtml('~~gone~~')).toBe('<p><s>gone</s></p>');
    expect(markdownToHtml('`code`')).toBe('<p><code>code</code></p>');
  });

  it('does not eat bold one asterisk at a time', () => {
    expect(markdownToHtml('**both** words')).toBe('<p><strong>both</strong> words</p>');
  });

  it('leaves markdown inside a code span alone', () => {
    // Marking it up would corrupt exactly the text someone quoted verbatim.
    expect(inlineMarkdown('`**literal**`')).toBe('<code>**literal**</code>');
  });

  it('does not invent a code span out of a bare number', () => {
    // The placeholder is a control character precisely so that ordinary digits
    // survive: a naive " 0 " placeholder would corrupt this line.
    expect(markdownToHtml('`x` and in 2026 the 0 arrived'))
      .toBe('<p><code>x</code> and in 2026 the 0 arrived</p>');
  });

  it('reads a link', () => {
    expect(markdownToHtml('[the site](https://x.test)'))
      .toBe('<p><a href="https://x.test" rel="noopener noreferrer">the site</a></p>');
  });

  it('promotes a bare domain rather than treating it as a path', () => {
    expect(markdownToHtml('[x](example.com)'))
      .toContain('href="https://example.com"');
  });

  it('keeps a URL containing brackets intact', () => {
    expect(markdownToHtml('[Bath](https://x.test/Bath_(disambiguation))'))
      .toContain('href="https://x.test/Bath_(disambiguation)"');
  });

  it('refuses a script URL, keeping the label as text', () => {
    // Never stored, not even transiently, in the one feature built to be handed
    // to an outsider.
    const html = markdownToHtml('[click](javascript:alert(1))');
    expect(html).toBe('<p>click</p>');
    expect(html).not.toContain('javascript');
  });
});

describe('internalSlug — links between pages of the same pack', () => {
  it('reads the form blocksToMarkdown writes', () => {
    expect(internalSlug('./overview.md')).toBe('overview');
  });

  it('reads the numbered layout inside the zip', () => {
    expect(internalSlug('pages/2-service-charge.md')).toBe('service-charge');
    expect(internalSlug('../pages/10-detail.md')).toBe('detail');
  });

  it('reads a bare filename and a published anchor', () => {
    expect(internalSlug('overview.md')).toBe('overview');
    expect(internalSlug('#overview')).toBe('overview');
  });

  it('is not fooled by anything absolute', () => {
    expect(internalSlug('https://x.test/a.md')).toBeNull();
    expect(internalSlug('mailto:a@b.test')).toBeNull();
    expect(internalSlug('javascript:alert(1)')).toBeNull();
  });

  it('is null for an ordinary path', () => {
    expect(internalSlug('files/notice.pdf')).toBeNull();
    expect(internalSlug('')).toBeNull();
  });
});

describe('markdownToHtml — cross-links', () => {
  it('turns an internal link into a docLink anchor, by SLUG', () => {
    // Pasted text cannot know a doc id. A slug is the durable address anyway —
    // a page's slug survives a rename by design.
    expect(markdownToHtml('see the [chronology](./chronology.md)'))
      .toBe('<p>see the <a data-doc-slug="chronology">chronology</a></p>');
  });

  it('gives the internal anchor no href, so it cannot parse as an external link', () => {
    // StarterKit's link mark parses a[href]; an anchor carrying both would be
    // ambiguous between the two marks.
    expect(markdownToHtml('[x](./a.md)')).not.toContain('href');
  });

  it('still reads an external link as an external link', () => {
    expect(markdownToHtml('[out](https://x.test)'))
      .toContain('rel="noopener noreferrer"');
  });
});

describe('markdownToHtml — escaping', () => {
  it('escapes before it marks up, so pasted text cannot introduce markup', () => {
    expect(markdownToHtml('<script>alert(1)</script>'))
      .toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('escapes inside a heading, a list and a code fence too', () => {
    expect(markdownToHtml('# <b>hi</b>')).toBe('<h1>&lt;b&gt;hi&lt;/b&gt;</h1>');
    expect(markdownToHtml('- <img src=x>')).toContain('&lt;img src=x&gt;');
    expect(markdownToHtml('```\n<b>\n```')).toBe('<pre><code>&lt;b&gt;</code></pre>');
  });

  it('escapes a quoted attribute in a link label', () => {
    expect(escapeHtml('a "b" c')).toBe('a &quot;b&quot; c');
  });
});

describe('looksLikeMarkdown', () => {
  it('accepts what a page from the archive looks like', () => {
    expect(looksLikeMarkdown('# Overview\n\nThe dispute began.')).toBe(true);
    expect(looksLikeMarkdown('- one\n- two')).toBe(true);
    expect(looksLikeMarkdown('> quoted')).toBe(true);
    expect(looksLikeMarkdown('```\ncode\n```')).toBe(true);
  });

  it('leaves ordinary prose alone', () => {
    // Converting text somebody meant literally is the irritating failure, and
    // it is harder to recover from than a paste that stayed plain.
    expect(looksLikeMarkdown('Just a sentence about the roof.')).toBe(false);
    expect(looksLikeMarkdown('We met on 3rd - 4th March.')).toBe(false);
    expect(looksLikeMarkdown('a * b * c')).toBe(false);
  });

  it('needs more than one KIND of inline mark on its own', () => {
    expect(looksLikeMarkdown('this is **bold** only')).toBe(false);
    expect(looksLikeMarkdown('**bold** and `code`')).toBe(true);
  });

  it('needs two list items, not one stray dash', () => {
    expect(looksLikeMarkdown('- shopping')).toBe(false);
    expect(looksLikeMarkdown('- one\n- two')).toBe(true);
  });

  it('ignores nothing much', () => {
    expect(looksLikeMarkdown('')).toBe(false);
    expect(looksLikeMarkdown('  ')).toBe(false);
    expect(looksLikeMarkdown(null)).toBe(false);
  });
});

describe('the round trip', () => {
  // What the archive writes, the editor must read. These use blocksToMarkdown's
  // real output rather than hand-written markdown.
  const page = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Background' }] },
      { type: 'paragraph', content: [
        { type: 'text', text: 'The ' },
        { type: 'text', text: 'notice', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' was served.' },
      ] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
      ] },
      { type: 'blockquote', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'as agreed' }] },
      ] },
    ],
  };

  it('survives export and re-import', () => {
    const markdown = blocksToMarkdown(page);
    expect(looksLikeMarkdown(markdown)).toBe(true);

    const html = markdownToHtml(markdown);
    expect(html).toContain('<h2>Background</h2>');
    expect(html).toContain('<strong>notice</strong>');
    expect(html).toContain('<ul><li><p>first</p></li><li><p>second</p></li></ul>');
    expect(html).toContain('<blockquote><p>as agreed</p></blockquote>');
  });

  it('carries the author-s blank lines all the way round', () => {
    // They went missing in the zip: the tidy-up that stops a nested list
    // leaving a double gap was collapsing the author's spacing with it.
    const spaced = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'above' }] },
      { type: 'paragraph' },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: 'below' }] },
    ] };

    const markdown = blocksToMarkdown(spaced);
    expect(markdown).toBe('above\n\n\n\nbelow');
    expect(markdownToHtml(markdown)).toBe('<p>above</p><p></p><p></p><p>below</p>');
  });

  it('carries a cross-link between pages all the way round', () => {
    // Export writes [label](./slug.md); import reads it back as a docLink. Without
    // this the navigation between pages — most of what makes a pack a pack rather
    // than a folder — was lost on re-import.
    const linked = { type: 'doc', content: [{
      type: 'paragraph', content: [{
        type: 'text', text: 'the detail',
        marks: [{ type: 'docLink', attrs: { target_doc_id: 'd2', target_slug: 'detail' } }],
      }],
    }] };

    const html = markdownToHtml(blocksToMarkdown(linked));
    expect(html).toBe('<p><a data-doc-slug="detail">the detail</a></p>');
  });

  it('carries a callout back as a quote rather than losing its text', () => {
    // The editor's callout has no markdown form, so the export writes it as a
    // labelled quote. Re-importing gives a quote, not a callout — content
    // preserved, styling not. Recorded here because it is a real limit.
    const callout = { type: 'doc', content: [{
      type: 'callout', attrs: { kind: 'warning' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Deadline Friday' }] }],
    }] };

    const html = markdownToHtml(blocksToMarkdown(callout));
    expect(html).toContain('Deadline Friday');
    expect(html).toContain('<blockquote>');
  });
});
