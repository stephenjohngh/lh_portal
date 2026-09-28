// src/lib/server/richTextDocx.js
// Rich-text HTML (from common/RichTextEditor — Management activities, Info
// notes) into Word, for the reports that print it.
//
// Moved out of api/reports/generate-docx/+server.js on 2026-09-28, where it
// could not be tested: a +server.js may export only HTTP verbs.
//
// ⛔ WHAT IT USED TO DROP. It understood <p>, <ul> and <ol> and nothing else,
// so once the editor learned to take pasted markdown, a pasted heading or code
// block vanished from the printed issues report with no error — and a pasted
// table would have come out as a column of loose cell texts. It now reads
// every block the editor can hold (richTextExtensions.js): headings, quotes,
// code, rules and tables, the last as a real Word table.
//
// ⚠ A bullet list refers to the numbering reference 'bullets', which the
// caller's Document must define (generate-docx does).
//
// Regex rather than a DOM parser: this runs on the server, and the input is our
// own sanitised editor output rather than arbitrary HTML.

import {
  Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, TableLayoutType, BorderStyle, ShadingType,
} from 'docx';

const MONO = 'Courier New';

/** Decode the entities Tiptap emits. */
export function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&amp;/g,  '&');       // last, so "&amp;lt;" stays literal
}

/**
 * Inline HTML (<strong>, <em>, <u>, <s>, <code>) into TextRuns. Other tags —
 * links, spans, <br> — are dropped and their text kept.
 * @param {string} html
 * @param {{ size?: number, color?: string, italics?: boolean, bold?: boolean }} [opts]
 */
export function parseInlineHtml(html, { size = 22, color, italics = false, bold: baseBold = false } = {}) {
  const runs = [];
  let bold = baseBold, italic = italics, underline = false, strike = false, code = false;

  const parts = String(html ?? '').split(/(<\/?(?:strong|b|em|i|u|s|code)>)/gi);

  for (const part of parts) {
    const lc = part.toLowerCase();
    if      (lc === '<strong>' || lc === '<b>')   { bold      = true;     continue; }
    else if (lc === '</strong>' || lc === '</b>') { bold      = baseBold; continue; }
    else if (lc === '<em>' || lc === '<i>')       { italic    = true;     continue; }
    else if (lc === '</em>' || lc === '</i>')     { italic    = italics;  continue; }
    else if (lc === '<u>')                        { underline = true;     continue; }
    else if (lc === '</u>')                       { underline = false;    continue; }
    else if (lc === '<s>')                        { strike    = true;     continue; }
    else if (lc === '</s>')                       { strike    = false;    continue; }
    else if (lc === '<code>')                     { code      = true;     continue; }
    else if (lc === '</code>')                    { code      = false;    continue; }

    const text = decodeEntities(part.replace(/<[^>]+>/g, ''));
    if (text) {
      runs.push(new TextRun({
        text,
        size,
        ...(color     ? { color }            : {}),
        ...(bold      ? { bold: true }       : {}),
        ...(italic    ? { italics: true }    : {}),
        ...(underline ? { underline: {} }    : {}),
        ...(strike    ? { strike: true }     : {}),
        ...(code      ? { font: MONO }       : {}),
      }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: '', size })];
}

/** A cell's or list item's content, without the <p> Tiptap wraps it in. */
function unwrapParagraphs(html) {
  return String(html ?? '')
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br>')
    .replace(/<\/?p[^>]*>/gi, '')
    .trim();
}

/** Headings shrink by level, and never below the body size. */
const HEADING_BUMP = { 1: 8, 2: 6, 3: 4, 4: 2, 5: 0, 6: 0 };

/** How far a quote is set in, per level of quoting. */
const QUOTE_INDENT = 360;

/**
 * Tiptap HTML into Word blocks: Paragraphs, and Tables for tables.
 * Falls back to plain paragraphs for a legacy non-HTML body.
 *
 * ⚠ The body sits at the page margin. The old converter asked for a 360-twip
 * indent through `spacing.left`, which is not a Word property and was ignored,
 * so no body was ever indented; that look is kept rather than changed
 * unasked. Real indents are used only where structure needs them: a quote
 * and a code block.
 *
 * @param {string} html
 * @param {{ size?: number, color?: string, italics?: boolean, quoteDepth?: number, contentWidth?: number }} [opts]
 *   contentWidth — the text width of the page in twips, which a table fills.
 *   Default: US Letter with half-inch margins (generate-docx).
 * @returns {Array<Paragraph|Table>}
 */
export function parseHtmlToDocxParagraphs(html, opts = {}) {
  const { size = 22, color, italics = false, quoteDepth = 0, contentWidth = 10800 } = opts;
  const indent = quoteDepth * QUOTE_INDENT;
  const at = (left) => (left > 0 ? { indent: { left } } : {});
  const para = (children, extra = {}) =>
    new Paragraph({ children, spacing: { before: 0, after: 40 }, ...at(indent), ...extra });

  if (!html) return [para([new TextRun({ text: '', size })])];

  // Plain text (legacy pre-editor bodies) — split on newlines.
  if (!html.trimStart().startsWith('<')) {
    return html.split('\n').map((line) =>
      para([new TextRun({ text: line, size, color, italics })]));
  }

  /** @type {Array<Paragraph|Table>} */
  const out = [];
  // Top-level blocks, in document order. The lookahead keeps `<p` from
  // matching `<pre>`. A block's own inner <p>s are consumed with it.
  const blockRe = /<(p|ul|ol|h[1-6]|blockquote|pre|table)(?=[\s>])[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let match;
  while ((match = blockRe.exec(html)) !== null) {
    const tag   = (match[1] ?? 'hr').toLowerCase();
    const inner = match[2] ?? '';

    if (tag === 'hr') {
      out.push(para([new TextRun({ text: '', size })], {
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } },
      }));
    } else if (tag === 'ul' || tag === 'ol') {
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let li;
      let n = 1;
      while ((li = liRe.exec(inner)) !== null) {
        const runs = parseInlineHtml(unwrapParagraphs(li[1]), { size, color, italics });
        if (tag === 'ul') {
          out.push(new Paragraph({
            children: runs,
            numbering: { reference: 'bullets', level: 0 },
            spacing: { before: 0, after: 40 },
          }));
        } else {
          // A prefix rather than Word numbering, which would share one counter
          // across every list in the report.
          out.push(para([new TextRun({ text: `${n++}.  `, size, color }), ...runs]));
        }
      }
    } else if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      out.push(para(parseInlineHtml(inner, { size: size + HEADING_BUMP[level], color, italics, bold: true }),
        { spacing: { before: 120, after: 40 } }));
    } else if (tag === 'blockquote') {
      // Its own paragraphs, lists and all, indented once more and in italics.
      out.push(...parseHtmlToDocxParagraphs(inner, { ...opts, italics: true, quoteDepth: quoteDepth + 1 }));
    } else if (tag === 'pre') {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).replace(/\n$/, '');
      for (const line of text.split('\n')) {
        out.push(para([new TextRun({ text: line, size: size - 2, color, font: MONO })],
          { spacing: { before: 0, after: 0 }, ...at(indent + 180) }));
      }
    } else if (tag === 'table') {
      const table = tableFromHtml(inner, { size, color, indent, contentWidth });
      if (table) out.push(table);
    } else {
      // <p>: empty and <br>-only paragraphs keep their blank line.
      const body = inner.trim();
      out.push(!body || body === '<br>'
        ? para([new TextRun({ text: '', size })])
        : para(parseInlineHtml(body, { size, color, italics })));
    }
  }

  // Nothing recognised — keep the text rather than lose it.
  if (out.length === 0) {
    out.push(para([new TextRun({ text: decodeEntities(html.replace(/<[^>]+>/g, '')), size, color, italics })]));
  }
  return out;
}

/** A cell's text, one entry per line (a <br> or a second paragraph). */
function cellLines(html) {
  return String(html ?? '')
    .split(/<br\s*\/?>/i)
    .map((line) => decodeEntities(line.replace(/<[^>]+>/g, '')).trim());
}

/**
 * Column widths from content, the way a browser lays out a table on screen.
 *
 * ⛔ WHY THIS EXISTS. A pasted table first printed with equal columns, so a
 * two-digit number got the same width as a paragraph — while the same table on
 * screen was sized to its content. The grid rule (tableGridGuard) was met and
 * the page was still wrong: declaring widths is necessary, and they must also
 * FIT what is in the column.
 *
 * Each column has a MINIMUM (its longest word, so nothing breaks mid-word) and
 * a NATURAL width (its longest line unwrapped):
 *   · everything fits at natural width → use it; the table is as narrow as its
 *     content, as on screen;
 *   · even the minimums do not fit → share the space by minimum, and words
 *     break (the only case they do);
 *   · otherwise every column gets its minimum, and the remaining space goes in
 *     proportion to how much each column still wants.
 *
 * Text is measured by characters: Arial averages about 0.55 of its size per
 * character, bold a little wider. An estimate, deliberately generous — a column
 * slightly wide reads fine; a number wrapping onto two lines does not.
 *
 * @param {Array<Array<{ lines: string[], bold?: boolean }>>} rows  padded to one width
 * @param {number} available  twips
 * @param {{ size?: number, padding?: number }} [opts]  size in half-points; padding in twips per cell
 * @returns {number[]}  twips per column, summing to at most `available`
 */
export function autoColumnWidths(rows, available, { size = 20, padding = 200 } = {}) {
  const charW = size * 5.5;                  // half-points × 10 → twips, × 0.55 average char width
  const columns = Math.max(0, ...rows.map((r) => r.length));
  if (!columns) return [];

  const min = Array(columns).fill(0);
  const natural = Array(columns).fill(0);
  for (const row of rows) {
    row.forEach((cell, i) => {
      const scale = cell?.bold ? 1.08 : 1;
      for (const line of cell?.lines ?? []) {
        const longestWord = Math.max(0, ...line.split(/\s+/).map((w) => w.length));
        min[i]     = Math.max(min[i], longestWord * charW * scale);
        natural[i] = Math.max(natural[i], line.length * charW * scale);
      }
    });
  }
  // Padding and a floor, so an empty column is still a column.
  const floor = 3 * charW;
  for (let i = 0; i < columns; i++) {
    min[i]     = Math.max(min[i], floor) + padding;
    natural[i] = Math.max(natural[i], min[i] - padding) + padding;
  }

  const sum = (a) => a.reduce((t, n) => t + n, 0);
  let widths;
  if (sum(natural) <= available) {
    widths = natural;
  } else if (sum(min) >= available) {
    widths = min.map((m) => (m / sum(min)) * available);
  } else {
    const spare = available - sum(min);
    const want  = natural.map((n, i) => n - min[i]);
    widths = min.map((m, i) => m + (spare * want[i]) / sum(want));
  }

  // Whole twips; flooring means rounding can never push the total past the page.
  return widths.map((w) => Math.max(1, Math.floor(w)));
}

/**
 * A pasted table as a real Word table, each column sized to its content
 * (autoColumnWidths), with a shaded header row. ⚠ columnWidths AND a fixed
 * layout, or Word sizes the columns from a placeholder grid
 * (tableGridGuard.test.js).
 */
function tableFromHtml(inner, { size, color, indent, contentWidth }) {
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(inner)) !== null) {
    const cells = [];
    const cellRe = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
    let c;
    while ((c = cellRe.exec(r[1])) !== null) {
      cells.push({ header: c[1].toLowerCase() === 'th', html: unwrapParagraphs(c[2]) });
    }
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return null;

  const columns = Math.max(...rows.map((row) => row.length));
  const width   = Math.max(contentWidth - indent, 1440);   // a quoted table narrows
  const colW    = autoColumnWidths(
    rows.map((row) => Array.from({ length: columns }, (_, i) => ({
      lines: cellLines(row[i]?.html),
      bold:  !!row[i]?.header,
    }))),
    width,
    { size: size - 2 },
  );
  const border  = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
  const borders = { top: border, bottom: border, left: border, right: border };

  return new Table({
    width:        { size: colW.reduce((t, n) => t + n, 0), type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: colW,
    ...(indent > 0 ? { indent: { size: indent, type: WidthType.DXA } } : {}),
    rows: rows.map((row) => new TableRow({
      children: Array.from({ length: columns }, (_, i) => {
        const cell = row[i] ?? { header: false, html: '' };
        return new TableCell({
          width:   { size: colW[i], type: WidthType.DXA },
          borders,
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          ...(cell.header ? { shading: { type: ShadingType.CLEAR, fill: 'EEF2F6', color: 'auto' } } : {}),
          children: [new Paragraph({
            children: parseInlineHtml(cell.html, { size: size - 2, color, bold: cell.header }),
          })],
        });
      }),
    })),
  });
}

/**
 * Rich-text HTML as plain text, for reports that print it as one run
 * (the meeting minutes). Keeps the shape the reader needs: one line per
 * paragraph, heading, list item and table row, cells separated by " | ".
 *
 * ⛔ It used to end lines only at </p>, </li> and <br>, so a pasted heading ran
 * straight into the paragraph after it, and a table's cells into one word.
 * @param {string} html
 */
export function htmlToText(html) {
  if (!html || !html.startsWith('<')) return html ?? '';
  return decodeEntities(html
    // A cell's own paragraph ends the cell, not the line.
    .replace(/<\/p>\s*<\/(th|td)>/gi, '</$1>')
    .replace(/<\/(th|td)>\s*(?=<(th|td)[\s>])/gi, ' | ')
    // Block-level closers → newline
    .replace(/<\/(p|li|h[1-6]|blockquote|pre|tr|table)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    // List items — prefix with a bullet
    .replace(/<li[^>]*>/gi, '• ')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, ''))
    // Collapse 3+ newlines → double newline; trim ends
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
