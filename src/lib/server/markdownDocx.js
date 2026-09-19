// src/lib/server/markdownDocx.js
//
// Markdown → Word, for the obligations statement. R5.
//
// ⛔ A DELIBERATELY SMALL SUBSET, AND IT NEVER DROPS A LINE. This converts the
// markdown the statement actually uses — headings, paragraphs, two-column
// tables, blockquotes, bullet and numbered lists, horizontal rules, and inline
// bold, italic and code. It is not a general markdown implementation and does
// not try to be.
//
// ⭐ THE PROPERTY THAT MATTERS IS NOT COVERAGE, IT IS THAT NOTHING VANISHES.
// Anything this does not recognise renders as an ordinary paragraph rather than
// being skipped. The worst fault this project has produced was nine register
// entries silently absent from every version of the statement ever produced,
// including the copy an external reviewer assessed — and a converter that
// quietly dropped a construct it had not been taught would be the same fault in
// a new place, on the same document. A test asserts that every non-blank source
// line's text reaches the output.
//
// ⚠ THE MARKER SYMBOLS (⛔ ⚠ ⭐ ✅ ❓ ·) CARRY MEANING IN THIS DOCUMENT and are
// passed through unchanged. Word substitutes a symbol font for glyphs Arial
// lacks, which is why they survive; stripping them to keep one font would
// remove the thing a reader scans for.

import {
  Paragraph, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType, VerticalAlign,
} from 'docx';
import {
  run, para, CONTENT_W, COLOURS, BORDERS, CELL_PAD,
} from './docxHelpers.js';

/** Heading level → the style id and size the statement uses. */
const HEADING = {
  1: { style: 'Heading1', size: 36, before: 0, after: 200 },
  2: { style: 'Heading1', size: 30, before: 400, after: 160 },
  3: { style: 'Heading2', size: 24, before: 320, after: 120 },
  4: { style: 'Heading2', size: 21, before: 280, after: 100 },
};

/**
 * Inline markdown → docx runs.
 *
 * ⚠ The order in the alternation matters: `**bold**` must be tried before
 * `*italic*`, or the italic branch matches the first two asterisks of a bold
 * span and the document fills with stray asterisks.
 *
 * @param {string} text
 * @param {{size?: number, bold?: boolean, color?: string}} [base]
 * @returns {import('docx').TextRun[]}
 */
export function inlineRuns(text, base = {}) {
  const src = String(text ?? '');
  if (!src) return [run('', base)];

  const parts = src.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g).filter(p => p !== '');
  return parts.map((p) => {
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
      return run(p.slice(2, -2), { ...base, bold: true });
    }
    if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) {
      // ⚠ Rendered as italic rather than in a monospace font. There is exactly
      // one code span in the statement's prose; introducing a second font for
      // it would be more conspicuous than the thing it marks.
      return run(p.slice(1, -1), { ...base, italics: true });
    }
    if (p.length > 2 && p.startsWith('*') && p.endsWith('*')) {
      return run(p.slice(1, -1), { ...base, italics: true });
    }
    return run(p, base);
  });
}

/** A markdown table row → its cells, trimmed. */
function splitRow(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

const isTable = l => /^\s*\|/.test(l);
const isSeparator = l => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-');
const isQuote = l => /^>\s?/.test(l);
const isBullet = l => /^\s*[-*·]\s+/.test(l);
const isNumbered = l => /^\s*\d+\.\s+/.test(l);
const isRule = l => /^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(l);
const isHeading = l => /^#{1,6}\s+/.test(l);

/**
 * Column widths for a table.
 *
 * ⚠ The statement's tables are almost all label/value pairs with an EMPTY
 * header row — that is how every register entry is laid out. An even split
 * wastes most of the page on a column holding two words.
 *
 * @param {number} cols
 * @param {number} width
 * @returns {number[]}
 */
function columnWidths(cols, width) {
  if (cols === 2) return [Math.round(width * 0.3), width - Math.round(width * 0.3)];
  const each = Math.floor(width / cols);
  return Array.from({ length: cols }, (_, i) => (i === cols - 1 ? width - each * (cols - 1) : each));
}

/**
 * Markdown → an array of docx blocks, ready for a section's `children`.
 *
 * @param {string} markdown
 * @param {{width?: number}} [opts]
 * @returns {(Paragraph|Table)[]}
 */
export function markdownToDocx(markdown, opts = {}) {
  const width = opts.width ?? CONTENT_W;
  const lines = String(markdown ?? '').split('\r\n').join('\n').split('\r').join('\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    // ── Horizontal rule ──────────────────────────────────────────────────────
    // ⚠ Rendered as spacing, not as a line. In this document a rule separates
    // top-level sections, and every section already starts with a heading that
    // has space above it; a drawn line would double the separation.
    if (isRule(line)) {
      out.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }));
      i++; continue;
    }

    // ── Heading ──────────────────────────────────────────────────────────────
    if (isHeading(line)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      const h = HEADING[Math.min(m[1].length, 4)];
      out.push(new Paragraph({
        style: h.style,
        spacing: { before: h.before, after: h.after },
        children: inlineRuns(m[2], { size: h.size, bold: true }),
      }));
      i++; continue;
    }

    // ── Table ────────────────────────────────────────────────────────────────
    if (isTable(line)) {
      const block = [];
      while (i < lines.length && isTable(lines[i])) { block.push(lines[i]); i++; }

      let rows = block.filter(l => !isSeparator(l)).map(splitRow);
      if (rows.length === 0) continue;

      // ⛔ `| | |` over `|---|---|` is how EVERY register entry is written — a
      // label/value table with no header. Keeping that first row would put an
      // empty dark band above all 116 of them, and an empty row above every
      // table in the prose too.
      const emptyHeader = block.findIndex(isSeparator) === 1 && rows[0].every(c => c === '');
      if (emptyHeader) rows = rows.slice(1);
      if (rows.length === 0) continue;

      const cols = Math.max(...rows.map(r => r.length));
      const widths = columnWidths(cols, width);

      // ⛔ An all-empty first row is a LABEL/VALUE table, not a headed one —
      // `| | |` over `|---|---|` is how every register entry is written. Giving
      // it a dark header band would put an empty navy stripe above all 116.
      const headed = block.findIndex(isSeparator) === 1 && rows[0].some(c => c !== '');

      const trs = rows.map((cells, r) => new TableRow({
        children: widths.map((w, c) => richCell(cells[c] ?? '', w, {
          bold: headed && r === 0,
          fill: headed && r === 0 ? COLOURS.headerFill : undefined,
          color: headed && r === 0 ? COLOURS.textWhite : undefined,
        })),
      }));

      out.push(new Table({
        width: { size: width, type: WidthType.DXA },
        borders: BORDERS,
        rows: trs,
      }));
      continue;
    }

    // ── Blockquote ───────────────────────────────────────────────────────────
    // ⚠ The statement uses these for the Status block and the note on the
    // title — material a reader must not skim past. Rendered as an indented,
    // shaded paragraph rather than dropped to a quotation style.
    if (isQuote(line)) {
      const block = [];
      while (i < lines.length && (isQuote(lines[i]) || lines[i].trim() === '>')) {
        block.push(lines[i].replace(/^>\s?/, '')); i++;
      }
      for (const chunk of splitParagraphs(block)) {
        out.push(new Paragraph({
          indent: { left: 300 },
          spacing: { before: 60, after: 120 },
          children: inlineRuns(chunk, { color: COLOURS.subheading ?? undefined }),
        }));
      }
      continue;
    }

    // ── Lists ────────────────────────────────────────────────────────────────
    if (isBullet(line) || isNumbered(line)) {
      const numbered = isNumbered(line);
      while (i < lines.length && (numbered ? isNumbered(lines[i]) : isBullet(lines[i]))) {
        const text = lines[i].replace(/^\s*(?:[-*·]|\d+\.)\s+/, '');
        const marker = numbered ? `${lines[i].trim().match(/^(\d+)\./)[1]}.  ` : '•  ';
        out.push(new Paragraph({
          indent: { left: 340, hanging: 220 },
          spacing: { before: 0, after: 60 },
          children: [run(marker), ...inlineRuns(text)],
        }));
        i++;
      }
      continue;
    }

    // ── Paragraph ────────────────────────────────────────────────────────────
    // Everything else, including anything this converter does not recognise.
    // ⛔ The fallback is a paragraph, never a skip.
    const block = [];
    while (i < lines.length && lines[i].trim() !== ''
      && !isTable(lines[i]) && !isQuote(lines[i]) && !isHeading(lines[i])
      && !isRule(lines[i]) && !isBullet(lines[i]) && !isNumbered(lines[i])) {
      block.push(lines[i]); i++;
    }
    if (block.length === 0) { // a construct that opens a block it cannot own
      out.push(para(lines[i])); i++; continue;
    }
    out.push(new Paragraph({
      spacing: { before: 0, after: 140 },
      children: inlineRuns(block.join(' ').trim()),
    }));
  }

  return out;
}

/**
 * A table cell whose text may carry inline markdown.
 *
 * ⚠ NOT `dCell` FROM `docxHelpers`, which takes a plain string — and every
 * label cell in the register is `**Label**`, so passing them through it would
 * print the asterisks. Same geometry, same borders, same padding; the only
 * difference is that the text is parsed rather than taken literally.
 *
 * @param {string} text
 * @param {number} widthDxa
 * @param {{bold?: boolean, fill?: string, color?: string}} [opts]
 * @returns {TableCell}
 */
function richCell(text, widthDxa, opts = {}) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    margins: CELL_PAD,
    borders: BORDERS,
    shading: { fill: opts.fill ?? 'FFFFFF', type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0 },
      children: inlineRuns(text || ' ', { bold: opts.bold, color: opts.color, size: 18 }),
    })],
  });
}

/** Consecutive non-blank lines are one paragraph; blank lines separate them. */
function splitParagraphs(lines) {
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === '') { if (cur.length) { out.push(cur.join(' ').trim()); cur = []; } }
    else cur.push(l);
  }
  if (cur.length) out.push(cur.join(' ').trim());
  return out;
}
