// src/lib/utils/markdownPaste.test.js
// Reading markdown back into a page — the other half of the archive.
//
// The round trip is the point: what packArchive.js writes out, this reads back.
// So several of these use the exact shapes that module emits.

import { describe, it, expect } from 'vitest';
import {
  markdownToHtml, inlineMarkdown, escapeHtml, looksLikeMarkdown, internalSlug,
  isTableRow, isTableDelimiter, tableCells,
  isTableRow, isTableDelimiter, tableCells,
} from './markdownPaste.js';
import { blocksToMarkdown } from '$lib/apps/dossier/utils/packArchive.js';

// Pack-internal links are opt-in: only Dossier has other pages for
// `./overview.md` to name, so the tests that want them ask for them.
const inPack = { internalLinks: true };

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
    expect(markdownToHtml('see the [chronology](./chronology.md)', inPack))
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

    const html = markdownToHtml(blocksToMarkdown(linked), inPack);
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

describe('markdownToHtml — outside a pack', () => {
  // The default, and what every editor other than Dossier gets.

  it('leaves a pack-style link as plain text rather than a dangling anchor', () => {
    // `./chronology.md` names nothing in a comment box. An anchor no schema
    // recognises would be dropped along with the label's formatting, so the
    // label is kept and the link is not.
    expect(markdownToHtml('see the [chronology](./chronology.md)'))
      .toBe('<p>see the chronology</p>');
  });

  it('still links a real URL', () => {
    expect(markdownToHtml('see [the guidance](https://gov.uk/x)'))
      .toBe('<p>see <a href="https://gov.uk/x" rel="noopener noreferrer">the guidance</a></p>');
  });
});

describe('markdownToHtml — heading levels follow the target schema', () => {
  // A comment box starts at h2 (RichTextEditor: levels [2, 3]), because the
  // comment itself is the top level. Emitting an h1 there would be dropped by
  // the schema, taking the heading's text with it.

  it('starts at h1 by default', () => {
    expect(markdownToHtml('# Top')).toBe('<h1>Top</h1>');
    expect(markdownToHtml('## Next')).toBe('<h2>Next</h2>');
  });

  it('shifts the whole scale down when the target starts lower', () => {
    expect(markdownToHtml('# Top', { minHeading: 2 })).toBe('<h2>Top</h2>');
    expect(markdownToHtml('## Next', { minHeading: 2 })).toBe('<h3>Next</h3>');
  });

  it('clamps past the bottom rather than dropping the line', () => {
    // A heading one size too small is a blemish; a heading the schema refuses
    // takes its text with it.
    expect(markdownToHtml('#### Deep', { minHeading: 2 })).toBe('<h3>Deep</h3>');
    expect(markdownToHtml('###### Deeper', { minHeading: 2 })).toBe('<h3>Deeper</h3>');
  });

  it('refuses a nonsensical floor rather than emitting an h0', () => {
    expect(markdownToHtml('# Top', { minHeading: 0 })).toBe('<h1>Top</h1>');
  });
});


describe('tables', () => {
  const table = [
    '| Badge | Meaning |',
    '|---|---|',
    '| Draft | Being written |',
    '| Issued | Sent to the contractor |',
  ].join('\n');

  it('recognises a delimiter row, and does not mistake prose for one', () => {
    expect(isTableDelimiter('|---|---|')).toBe(true);
    expect(isTableDelimiter('| :--- | ---: | :---: |')).toBe(true);
    expect(isTableDelimiter('| Draft | Being written |')).toBe(false);
    // An em-dash cell is content, not a delimiter.
    expect(isTableDelimiter('| — | — |')).toBe(false);
  });

  it('treats the outer pipes as fences, not as empty cells', () => {
    expect(tableCells('| a | b |')).toEqual(['a', 'b']);
    expect(tableCells('a | b')).toEqual(['a', 'b']);       // unfenced is valid GFM
  });

  it('builds a real table where the target has one', () => {
    expect(markdownToHtml(table, { tables: true })).toBe(
      '<table><tbody>'
      + '<tr><th><p>Badge</p></th><th><p>Meaning</p></th></tr>'
      + '<tr><td><p>Draft</p></td><td><p>Being written</p></td></tr>'
      + '<tr><td><p>Issued</p></td><td><p>Sent to the contractor</p></td></tr>'
      + '</tbody></table>');
  });

  it('keeps inline marks inside cells', () => {
    const html = markdownToHtml('| **Draft** | see `spec` |\n|---|---|\n| a | b |',
      { tables: true });
    expect(html).toContain('<th><p><strong>Draft</strong></p></th>');
    expect(html).toContain('<th><p>see <code>spec</code></p></th>');
  });

  it('pads a ragged row rather than dropping its content', () => {
    // A missing trailing pipe is a typo; losing the row over it would be the
    // worst outcome available here.
    const html = markdownToHtml('| a | b | c |\n|---|---|---|\n| 1 | 2 |', { tables: true });
    expect(html).toContain('<tr><td><p>1</p></td><td><p>2</p></td><td><p></p></td></tr>');
  });

  it('puts each row on its own line where the target has no table node', () => {
    // The default. Before this every row was joined into ONE paragraph, and a
    // table arrived as a single unreadable line of pipes.
    expect(markdownToHtml(table)).toBe(
      '<p>| Badge | Meaning |</p>'
      + '<p>| Draft | Being written |</p>'
      + '<p>| Issued | Sent to the contractor |</p>');
  });

  it('carries on with the text after a table', () => {
    expect(markdownToHtml(table + '\n\nAfter.', { tables: true }))
      .toContain('</table><p>After.</p>');
    expect(markdownToHtml(table + '\n\nAfter.')).toContain('<p>After.</p>');
  });

  it('does not read a lone pipe in prose as a table', () => {
    const prose = 'Use grep | head to see the first lines.';
    expect(markdownToHtml(prose, { tables: true })).toBe('<p>' + prose + '</p>');
    expect(isTableRow(prose)).toBe(true);   // loose on its own...
    expect(isTableDelimiter('to see the first lines.')).toBe(false);  // ...the delimiter decides
  });

  it('recognises a pasted table as markdown at all', () => {
    // Without this the paste is left alone and the pipes stay pipes, whatever
    // the converter could have done with them.
    expect(looksLikeMarkdown(table)).toBe(true);
    expect(looksLikeMarkdown('Use grep | head to see the first lines.')).toBe(false);
  });
});

describe('a quote holds markdown, not just prose', () => {
  // The lines inside a quote have had their `>` removed, so what is left is an
  // ordinary document. Flattening it into one paragraph was wrong in a way only
  // tables made visible: the tutorial's own header block is a table inside a
  // quote, and it arrived as a line of pipes.

  it('renders a table inside a quote', () => {
    const md = [
      '> **Scope:** what this covers.',
      '>',
      '> | Sections | Covers |',
      '> |---|---|',
      '> | 1–2 | Setting up |',
      '>',
      '> Read it first.',
    ].join('\n');

    const html = markdownToHtml(md, { tables: true });
    expect(html).toContain('<blockquote><p><strong>Scope:</strong> what this covers.</p>');
    expect(html).toContain('<table><tbody><tr><th><p>Sections</p></th>');
    expect(html).toContain('<p>Read it first.</p></blockquote>');
  });

  it('renders a list inside a quote', () => {
    expect(markdownToHtml('> - a\n> - b'))
      .toBe('<blockquote><ul><li><p>a</p></li><li><p>b</p></li></ul></blockquote>');
  });

  it('keeps two quoted paragraphs apart', () => {
    // A bare `>` is the quote's own blank line: it separates blocks inside the
    // quote rather than ending it.
    expect(markdownToHtml('> first\n>\n> second'))
      .toBe('<blockquote><p>first</p><p>second</p></blockquote>');
  });

  it('nests a quote inside a quote', () => {
    // Each level strips one `>`, so the recursion is bounded by the text.
    expect(markdownToHtml('> outer\n> > inner'))
      .toBe('<blockquote><p>outer</p><blockquote><p>inner</p></blockquote></blockquote>');
  });

  it('still joins a plain wrapped quote into one paragraph', () => {
    // The common case must not change: a quote wrapped across two source lines
    // is one paragraph, not two.
    expect(markdownToHtml('> one line\n> continued here'))
      .toBe('<blockquote><p>one line continued here</p></blockquote>');
  });

  it('puts quoted table rows on their own lines where there is no table node', () => {
    const md = '> | A | B |\n> |---|---|\n> | 1 | 2 |';
    expect(markdownToHtml(md))
      .toBe('<blockquote><p>| A | B |</p><p>| 1 | 2 |</p></blockquote>');
  });
});

describe('a wrapped list item is one item', () => {
  // A markdown author wraps a long bullet across several source lines and means
  // ONE bullet. Emitting the item on sight made every continuation line into a
  // paragraph AFTER the list — which is what a pasted document looked like the
  // moment anything ran past the margin.

  it('joins the continuation lines into the item', () => {
    const md = [
      '- You need **Building Assets** in your app switcher, and you must be an',
      '  **admin**. The tab is visible to everyone with the app.',
      '- **Migration 177 must be applied.** Without it the tab loads and then',
      '  fails the moment it queries `works_schedules`.',
    ].join('\n');

    const html = markdownToHtml(md);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('you must be an <strong>admin</strong>. The tab');
    // Nothing escaped the list into a paragraph of its own.
    expect(html).not.toContain('</ul><p>');
  });

  it('continues an item that was not indented', () => {
    // Lazy continuation: CommonMark allows it, and a reflowed paste loses the
    // indent anyway.
    expect(markdownToHtml('- first line\nsecond line'))
      .toBe('<ul><li><p>first line second line</p></li></ul>');
  });

  it('ends the item at the next block, whatever kind it is', () => {
    expect(markdownToHtml('- a\n\n## Heading'))
      .toBe('<ul><li><p>a</p></li></ul><h2>Heading</h2>');
    expect(markdownToHtml('- a\n> quoted'))
      .toBe('<ul><li><p>a</p></li></ul><blockquote><p>quoted</p></blockquote>');
    expect(markdownToHtml('- a\n---'))
      .toBe('<ul><li><p>a</p></li></ul><hr>');
  });

  it('still nests a sub-list rather than continuing the item', () => {
    expect(markdownToHtml('- top\n  - under\n- next'))
      .toBe('<ul><li><p>top</p></li><ul><li><p>under</p></li></ul><li><p>next</p></li></ul>');
  });

  it('starts a paragraph again after the list', () => {
    expect(markdownToHtml('- a\n\nAfter the list.'))
      .toBe('<ul><li><p>a</p></li></ul><p>After the list.</p>');
  });

  it('joins a wrapped item inside a quote too', () => {
    expect(markdownToHtml('> - wrapped over\n>   two lines'))
      .toBe('<blockquote><ul><li><p>wrapped over two lines</p></li></ul></blockquote>');
  });
});
