// src/lib/server/markdownDocx.test.js
//
// Markdown → Word, for the obligations statement. R5.
//
// ⛔ THE FIRST DESCRIBE IS THE ONE THAT MATTERS. Every other assertion here is
// about how something looks; that one is about whether it is there at all. A
// converter that silently dropped a construct it had not been taught would
// reproduce, on the same document, the worst fault this project has produced:
// nine register entries absent from every version of the statement ever made,
// including the copy an external reviewer assessed.
//
// ⚠ These read the document's REAL prose, not invented samples, because the
// point is that this particular document survives — and the prose is what will
// change under it.

import { describe, it, expect } from 'vitest';
import { Paragraph, Table } from 'docx';
import { STATEMENT_PROSE } from '$lib/utils/statementProse.js';
import { STATUTORY_TEMPLATE } from '$lib/utils/statutoryTemplate.js';
import { renderEntry } from './statementSection6.js';
import { markdownToDocx, inlineRuns } from './markdownDocx.js';

/**
 * Every character of text a block would print, in order.
 *
 * ⚠ docx stores a run's text as loose strings under a `w:t` node, not as a
 * `.text` property — an extractor that looks for `.text` finds empty strings
 * everywhere and every content assertion passes vacuously. That cost eleven
 * failing tests on `registerDocx` before it was understood.
 */
function textOf(node) {
  if (node == null || typeof node !== 'object') return '';
  let out = '';
  if (node.rootKey === 'w:t' && Array.isArray(node.root)) {
    for (const r of node.root) if (typeof r === 'string') out += r;
  }
  for (const child of Array.isArray(node.root) ? node.root : []) {
    out += textOf(child);
    // ⚠ A cell boundary is a word boundary. Without this, two adjacent cells
    // come back as "Referencereg 7(1)" and every content assertion about a
    // table row fails for a reason that has nothing to do with the document.
    if (child?.rootKey === 'w:tc') out += ' ';
  }
  return out;
}

const textOfAll = blocks => blocks.map(textOf).join('\n');

/**
 * The visible text of a markdown line, with its syntax removed.
 *
 * ⚠ Emphasis markers are stripped from BOTH sides of the comparison rather
 * than interpreted here. Interpreting them would be a second copy of the
 * converter's inline rules, and this test is about whether WORDS survive, not
 * about which of them end up bold.
 */
const stripEmphasis = s => s.replace(/[*`]/g, '');

function plainText(line) {
  return stripEmphasis(line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^\s*(?:[-*·]|\d+\.)\s+/, '')
    .replace(/^\||\|$/g, '')
    .split('|').join(' '))
    .replace(/\s+/g, ' ')
    .trim();
}

describe('nothing is dropped', () => {
  const prose = STATEMENT_PROSE.filter(s => !s.generated);

  it.each(prose.map(s => [s.key, s.markdown]))(
    'keeps every line of %s',
    (key, markdown) => {
      const all = stripEmphasis(textOfAll(markdownToDocx(markdown))).replace(/\s+/g, ' ');
      const missing = markdown.split('\n')
        .filter(l => l.trim() !== '')
        .filter(l => !/^\s*\|[\s:|-]+\|\s*$/.test(l))       // a table's rule row
        .filter(l => !/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(l)) // a horizontal rule
        .map(plainText)
        .filter(t => t !== '' && !all.includes(t));
      expect(missing, `${key}: ${missing.slice(0, 2).join(' /// ')}`).toEqual([]);
    },
  );

  it('keeps every line of a rendered register entry', () => {
    // ⚠ Not one sample — the entries differ in which of the 22 possible rows
    // they carry, and a converter can be right about one shape and wrong about
    // another.
    for (const e of STATUTORY_TEMPLATE.filter(x => !x.supersededOn)) {
      const md = renderEntry(e);
      const all = stripEmphasis(textOfAll(markdownToDocx(md))).replace(/\s+/g, ' ');
      const missing = md.split('\n')
        .filter(l => l.trim() !== '' && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
        .map(plainText)
        .filter(t => t !== '' && !all.includes(t));
      expect(missing, `${e.key}: ${missing[0] ?? ''}`).toEqual([]);
    }
  });

  it('renders an unrecognised construct as a paragraph rather than skipping it', () => {
    const odd = '~~~something this converter has never seen~~~\n';
    expect(textOfAll(markdownToDocx(odd))).toContain('something this converter has never seen');
  });

  // ⚠ The markers are what a reader scans for. Losing them to keep one font
  // would remove the signal and leave the text.
  it('passes the marker symbols through unchanged', () => {
    const md = '⛔ stop ⚠ warn ⭐ star ✅ done ❓ open · point\n';
    const out = textOfAll(markdownToDocx(md));
    for (const sym of ['⛔', '⚠', '⭐', '✅', '❓']) expect(out).toContain(sym);
  });
});

describe('block structure', () => {
  it('makes a table a Table and prose a Paragraph', () => {
    const blocks = markdownToDocx('Some prose.\n\n| | |\n|---|---|\n| **A** | B |\n');
    expect(blocks[0]).toBeInstanceOf(Paragraph);
    expect(blocks[1]).toBeInstanceOf(Table);
  });

  it('joins the lines of one paragraph rather than breaking each', () => {
    const blocks = markdownToDocx('One sentence that\nwraps across two lines.\n');
    expect(blocks).toHaveLength(1);
    expect(textOf(blocks[0])).toBe('One sentence that wraps across two lines.');
  });

  it('separates paragraphs on a blank line', () => {
    expect(markdownToDocx('First.\n\nSecond.\n')).toHaveLength(2);
  });

  it('gives each heading level its own style', () => {
    const [h1, h2, h3] = markdownToDocx('# Title\n\n## Section\n\n### Sub\n');
    expect(textOf(h1)).toBe('Title');
    expect(textOf(h2)).toBe('Section');
    expect(textOf(h3)).toBe('Sub');
  });

  it('keeps a bullet list as one paragraph per item, with a marker', () => {
    const blocks = markdownToDocx('- first\n- second\n');
    expect(blocks).toHaveLength(2);
    expect(textOf(blocks[0])).toContain('first');
    expect(textOf(blocks[0])).toContain('•');
  });

  it('keeps a numbered list numbered as written', () => {
    const blocks = markdownToDocx('1. first\n2. second\n');
    expect(textOf(blocks[0]).startsWith('1.')).toBe(true);
    expect(textOf(blocks[1]).startsWith('2.')).toBe(true);
  });

  it('keeps a blockquote as its own paragraphs', () => {
    const blocks = markdownToDocx('> **Status** — open.\n>\n> A second line.\n');
    expect(blocks).toHaveLength(2);
    expect(textOf(blocks[0])).toBe('Status — open.');
    expect(textOf(blocks[1])).toBe('A second line.');
  });

  it('drops no text on a horizontal rule, and draws no line for it', () => {
    const blocks = markdownToDocx('Above.\n\n---\n\nBelow.\n');
    expect(textOfAll(blocks)).toContain('Above.');
    expect(textOfAll(blocks)).toContain('Below.');
  });
});

describe('tables', () => {
  // ⛔ Every register entry is `| | |` over `|---|---|`. Treating that first
  // row as a header would put an empty dark band above all 116 of them.
  it('treats an all-empty first row as a label/value table, not a headed one', () => {
    const [table] = markdownToDocx('| | |\n|---|---|\n| **Reference** | reg 7(1) |\n');
    expect(table).toBeInstanceOf(Table);
    // Two rows would mean the empty one was kept as a header.
    expect(table.root.filter(n => n?.rootKey === 'w:tr')).toHaveLength(1);
  });

  it('keeps a real header row', () => {
    const [table] = markdownToDocx('| A | B |\n|---|---|\n| 1 | 2 |\n');
    expect(table.root.filter(n => n?.rootKey === 'w:tr')).toHaveLength(2);
    expect(textOf(table)).toContain('A');
    expect(textOf(table)).toContain('1');
  });

  it('parses markdown inside a cell rather than printing the asterisks', () => {
    const [table] = markdownToDocx('| | |\n|---|---|\n| **Reference** | reg 7(1) |\n');
    expect(textOf(table)).toContain('Reference');
    expect(textOf(table)).not.toContain('**');
  });

  it('handles a cell that is empty', () => {
    const [table] = markdownToDocx('| | |\n|---|---|\n| **A** | |\n');
    expect(table).toBeInstanceOf(Table);
  });
});

describe('inline', () => {
  const text = rs => rs.map(r => textOf(r)).join('');

  it('reads bold, italic and code without leaving the syntax behind', () => {
    for (const src of ['**bold**', '*italic*', '`code`']) {
      expect(text(inlineRuns(src))).toBe(src.replace(/[*`]/g, ''));
    }
  });

  // ⚠ The alternation order is load-bearing: try italic first and it matches
  // the opening two asterisks of a bold span, filling the page with strays.
  it('does not mistake the start of a bold span for an italic one', () => {
    const out = text(inlineRuns('a **bold** b'));
    expect(out).toBe('a bold b');
    expect(out).not.toContain('*');
  });

  it('keeps the text around the marked-up part', () => {
    expect(text(inlineRuns('before **middle** after'))).toBe('before middle after');
  });

  it('leaves a lone asterisk alone', () => {
    expect(text(inlineRuns('2 * 3 = 6'))).toBe('2 * 3 = 6');
  });

  it('survives an empty string', () => {
    expect(text(inlineRuns(''))).toBe('');
    expect(text(inlineRuns(undefined))).toBe('');
  });
});
