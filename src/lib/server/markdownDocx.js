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
  WidthType, AlignmentType, ShadingType, VerticalAlign, TableLayoutType,
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

/** Roughly what one character of Arial 9pt occupies, in DXA. */
const CHAR_W = 105;
/** `CELL_PAD` left + right. A column narrower than this shows nothing at all. */
const PAD_W = 240;
/** At or below this many characters, a column is a label rather than prose. */
const NARROW_MAX_CHARS = 24;
/** A label column never needs more than this; its header may wrap. */
const NARROW_CAP = 1000;
/** Below this nothing is legible, whatever the content length says. */
const NARROW_MIN = 620;
/** Prose columns keep at least this share of the page between them. */
const MIN_PROSE_SHARE = 0.4;

/** Rendered length — the markup does not take up space on the page. */
const renderedLength = s => String(s ?? '').replace(/[*`]/g, '').length;

/**
 * Column widths for a table.
 *
 * ⚠ AN EVEN SPLIT IS WRONG FOR EVERY TABLE IN THIS DOCUMENT, and the numbers
 * say so. Of the 124 tables, 121 are label/value pairs with an empty header
 * row — that is how every register entry is laid out — and the other three have
 * columns whose longest cell is 9, 14 or 19 characters sitting beside columns
 * whose longest is 439, 748 and 1635. Splitting six ways evenly gives the
 * 1,635-character cell the same 1.2 inches as the word "Due".
 *
 * So: a column whose content is short is sized to its content and capped; the
 * columns carrying prose share everything left over, equally.
 *
 * ⭐ EQUALLY, NOT IN PROPORTION TO THEIR CONTENT. Proportional allocation is
 * driven by the single longest cell — one 1,635-character row would squeeze its
 * neighbour to an inch on the strength of one outlier — and the two prose
 * columns in these tables are read side by side.
 *
 * @param {number} cols
 * @param {number} width
 * @param {string[][]} rows   including the header row, if there is one
 * @returns {number[]}
 */
function columnWidths(cols, width, rows = []) {
  // ⚠ The label/value case keeps its own rule. Sizing it by content would give
  // the label column six per cent of the page, because a register entry's value
  // cell routinely runs to several hundred characters.
  if (cols === 2) return [Math.round(width * 0.3), width - Math.round(width * 0.3)];

  const longest = Array.from({ length: cols }, (_, c) =>
    Math.max(0, ...rows.map(r => renderedLength(r[c]))));

  const narrow = longest.map(n => n <= NARROW_MAX_CHARS);
  if (!narrow.some(Boolean) || narrow.every(Boolean)) {
    const each = Math.floor(width / cols);
    return Array.from({ length: cols }, (_, i) => (i === cols - 1 ? width - each * (cols - 1) : each));
  }

  let sized = longest.map((n, c) => (narrow[c]
    ? Math.min(NARROW_CAP, Math.max(NARROW_MIN, n * CHAR_W + PAD_W))
    : 0));

  // ⚠ Enough label columns and they would take the whole page. Scale them back
  // rather than letting the prose columns collapse.
  const narrowTotal = sized.reduce((a, b) => a + b, 0);
  const cap = Math.floor(width * (1 - MIN_PROSE_SHARE));
  if (narrowTotal > cap) {
    const scale = cap / narrowTotal;
    sized = sized.map(w => Math.floor(w * scale));
  }

  const wideCount = narrow.filter(n => !n).length;
  const remaining = width - sized.reduce((a, b) => a + b, 0);
  const each = Math.floor(remaining / wideCount);

  let used = 0;
  const out = sized.map((w, c) => {
    const v = narrow[c] ? w : each;
    used += v;
    return v;
  });
  // The rounding remainder goes to the last prose column, so the row adds up.
  for (let c = cols - 1; c >= 0; c--) {
    if (!narrow[c]) { out[c] += width - used; break; }
  }
  return out;
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
      const widths = columnWidths(cols, width, rows);

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

      // ⛔ A FIXED-LAYOUT TABLE NEEDS BOTH OF THESE, AND EITHER ALONE IS USELESS.
      //
      // Without `layout`, a table defaults to AUTOFIT and the renderer sizes
      // columns from their content. With `layout` but without `columnWidths`,
      // the library emits a PLACEHOLDER `<w:tblGrid>` of 100 DXA per column —
      // and the renderer honours the GRID, not the per-cell `w:tcW`. Equal grid,
      // equal columns, whatever each cell declares.
      //
      // ⚠ This took three passes to find, and each pass asserted something one
      // level short of what the reader sees: first the `w:tcW` values (correct
      // all along), then `w:tblLayout` (added, still wrong), and only then the
      // grid. Eight table builders in this codebase already pass both; three did
      // not, and all three rendered evenly. `tableGridGuard.test.js` now makes
      // it a rule instead of something each new builder rediscovers.
      out.push(new Table({
        width: { size: width, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: widths,
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
        const first = lines[i];
        const marker = numbered ? `${first.trim().match(/^(\d+)\./)[1]}.  ` : '•  ';
        const parts = [first.replace(/^\s*(?:[-*·]|\d+\.)\s+/, '').trim()];
        i++;

        // ⛔ AN ITEM'S CONTINUATION LINES BELONG TO THE ITEM. Every numbered
        // item in §1 wraps across three or four indented lines; without this
        // they fell through to the paragraph branch and each became a separate
        // paragraph, so one sentence was broken mid-clause and the rest of it
        // lost its number. It read as a formatting fault, which is what it was.
        while (i < lines.length && lines[i].trim() !== ''
          && /^\s+\S/.test(lines[i])
          && !isBullet(lines[i]) && !isNumbered(lines[i])
          && !isTable(lines[i]) && !isHeading(lines[i])
          && !isQuote(lines[i]) && !isRule(lines[i])) {
          parts.push(lines[i].trim());
          i++;
        }

        out.push(new Paragraph({
          indent: { left: 340, hanging: 220 },
          spacing: { before: 0, after: 60 },
          children: [run(marker), ...inlineRuns(parts.join(' '))],
        }));
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
    // ⚠ EACH LINE IS TRIMMED BEFORE JOINING. A markdown source line may carry
    // indentation that means nothing on the page; joining raw produced runs of
    // four and five spaces mid-sentence — `already    had` — which reads as a
    // broken document rather than as an artefact of how the source is wrapped.
    out.push(new Paragraph({
      spacing: { before: 0, after: 140 },
      children: inlineRuns(block.map(l => l.trim()).join(' ').trim()),
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
    if (l.trim() === '') { if (cur.length) { out.push(cur.join(' ')); cur = []; } }
    else cur.push(l.trim());          // ⚠ trimmed before joining — see the paragraph branch
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}
