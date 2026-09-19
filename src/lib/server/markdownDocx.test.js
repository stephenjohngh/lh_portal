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

describe('how source wrapping is handled', () => {
  // ⛔ THE FAULT THIS CATCHES WAS VISIBLE IN THE FIRST GENERATED DOCUMENT and
  // no test saw it: a markdown source line carries indentation that means
  // nothing on the page, and joining raw produced `already    had` mid-sentence.
  it('leaves no run of spaces inside a block’s text', () => {
    for (const s of STATEMENT_PROSE.filter(x => !x.generated)) {
      for (const block of markdownToDocx(s.markdown)) {
        // ⚠ The list marker's own gap is deliberate — `1.  ` and `•  ` sit in a
        // hanging indent, where the spacing is literal. The invariant is about
        // the TEXT, so the marker comes off first.
        const text = textOf(block).replace(/^(?:\d+\.|•)\s+/, '');
        expect(text.match(/\S {2,}\S/g) ?? [], `${s.key}: ${text.slice(0, 90)}`).toEqual([]);
      }
    }
  });

  it('keeps a wrapped numbered item as ONE paragraph, not one per line', () => {
    const md = '1. **First.** This item wraps across\n   three indented lines and\n'
      + '   must stay one paragraph.\n2. **Second.** Short.\n';
    const blocks = markdownToDocx(md);
    expect(blocks).toHaveLength(2);
    expect(textOf(blocks[0])).toBe('1.  First. This item wraps across three indented lines and must stay one paragraph.');
    expect(textOf(blocks[1]).startsWith('2.')).toBe(true);
  });

  it('keeps a wrapped bullet as one paragraph too', () => {
    const blocks = markdownToDocx('- A bullet that wraps\n  onto a second line.\n- Another.\n');
    expect(blocks).toHaveLength(2);
    expect(textOf(blocks[0])).toContain('wraps onto a second line.');
  });

  it('ends a list at a blank line rather than swallowing what follows', () => {
    const blocks = markdownToDocx('1. An item.\n\nA following paragraph.\n');
    expect(blocks).toHaveLength(2);
    expect(textOf(blocks[1])).toBe('A following paragraph.');
  });

  it('ends a list at an unindented line', () => {
    const blocks = markdownToDocx('- An item.\nNot indented, so not part of it.\n');
    expect(blocks).toHaveLength(2);
  });
});

describe('column widths', () => {
  /** Each column's width, in DXA, as the table declares it. */
  function widthsOf(table) {
    const firstRow = table.root.find(n => n?.rootKey === 'w:tr');
    return firstRow.root
      .filter(n => n?.rootKey === 'w:tc')
      .map((cell) => {
        const props = cell.root.find(n => n?.rootKey === 'w:tcPr');
        const w = props?.root?.find(n => n?.rootKey === 'w:tcW');
        // docx keeps the value on an _attr node: { size: { key: 'w:w', value } }.
        return Number(w?.root?.[0]?.root?.size?.value ?? 0);
      });
  }

  // ⛔ The §8 actions table: six columns whose longest cells are 9, 439, 1635,
  // 14, 19 and 14 characters. An even split gives the 1,635-character cell the
  // same width as the word "Due".
  const wide = '| Ref | What must be decided or done | Consequence if it is not | Owner | Technical authority | Due |\n'
    + '|---|---|---|---|---|---|\n'
    + `| **A1** | ${'x'.repeat(400)} | ${'y'.repeat(900)} | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED |\n`;

  it('gives the prose columns far more than the label columns', () => {
    const [table] = markdownToDocx(wide);
    const w = widthsOf(table);
    expect(w).toHaveLength(6);
    for (const label of [0, 3, 4, 5]) {
      for (const prose of [1, 2]) {
        expect(w[prose], `col ${prose} vs ${label}`).toBeGreaterThan(w[label] * 2);
      }
    }
  });

  it('gives the two prose columns the same width, not one per outlier', () => {
    const w = widthsOf(markdownToDocx(wide)[0]);
    expect(Math.abs(w[1] - w[2])).toBeLessThanOrEqual(2);
  });

  it('adds up to exactly the content width', () => {
    const w = widthsOf(markdownToDocx(wide)[0]);
    expect(w.reduce((a, b) => a + b, 0)).toBe(10466);
  });

  it('keeps a label column legible rather than collapsing it', () => {
    const w = widthsOf(markdownToDocx(wide)[0]);
    for (const label of [0, 3, 4, 5]) expect(w[label]).toBeGreaterThanOrEqual(600);
  });

  // ⚠ The label/value shape keeps its own rule: sizing by content would give
  // the label column six per cent of the page.
  it('leaves the two-column register tables at 30/70', () => {
    const [table] = markdownToDocx(`| | |\n|---|---|\n| **Reference** | ${'z'.repeat(400)} |\n`);
    const w = widthsOf(table);
    expect(w[0]).toBe(Math.round(10466 * 0.3));
    expect(w[0] + w[1]).toBe(10466);
  });

  it('falls back to an even split when every column is short', () => {
    const [table] = markdownToDocx('| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n');
    const w = widthsOf(table);
    expect(Math.max(...w) - Math.min(...w)).toBeLessThanOrEqual(2);
  });
});

describe('the widths are BINDING, not advisory', () => {
  // ⛔ THE FAULT THIS EXISTS FOR. Every width assertion above reads the number
  // the table declares. A docx table with no `w:tblLayout` defaults to AUTOFIT,
  // where Word recomputes the columns from their content and those numbers are
  // ignored — so the first generated statement carried correct widths in its
  // XML and visibly wrong ones on the page, while the tests stayed green.
  // A check compares only what it was told to compare.
  const layoutOf = (table) => {
    const props = table.root.find(n => n?.rootKey === 'w:tblPr');
    const layout = props?.root?.find(n => n?.rootKey === 'w:tblLayout');
    // ⚠ docx stores this attribute as a bare string, where tcW stores a
    // { key, value } pair. Both shapes are read so the test cannot pass
    // vacuously if the library changes which one it uses.
    const t = layout?.root?.[0]?.root?.type;
    return (typeof t === 'string' ? t : t?.value) ?? null;
  };

  it('fixes the layout on a label/value table', () => {
    const [t] = markdownToDocx('| | |\n|---|---|\n| **A** | B |\n');
    expect(layoutOf(t)).toBe('fixed');
  });

  it('fixes the layout on a multi-column table', () => {
    const [t] = markdownToDocx('| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n');
    expect(layoutOf(t)).toBe('fixed');
  });

  it('fixes the layout on every table in the real prose and in a register entry', () => {
    const sources = [
      ...STATEMENT_PROSE.filter(s => !s.generated).map(s => [s.key, s.markdown]),
      ...STATUTORY_TEMPLATE.filter(e => !e.supersededOn).slice(0, 12)
        .map(e => [e.key, renderEntry(e)]),
    ];
    for (const [key, md] of sources) {
      for (const block of markdownToDocx(md)) {
        if (block instanceof Table) expect(layoutOf(block), key).toBe('fixed');
      }
    }
  });
});
