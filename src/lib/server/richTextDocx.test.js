// src/lib/server/richTextDocx.test.js
// Rich-text HTML into the Word reports (2026-09-28). The assertions read the
// PACKED document.xml: "every object was built" and "a reader sees it" are
// different claims, and only the second was ever the point.

import { describe, it, expect } from 'vitest';
import { Document, Packer, AlignmentType } from 'docx';
import JSZip from 'jszip';
import { parseHtmlToDocxParagraphs, htmlToText, autoColumnWidths } from './richTextDocx.js';

/** Pack blocks into a document shaped like the issues report, return its XML. */
async function packedXml(blocks) {
  const doc = new Document({
    numbering: { config: [{
      reference: 'bullets',
      levels: [{ level: 0, format: 'bullet', text: '•', alignment: AlignmentType.LEFT }],
    }] },
    sections: [{ children: blocks }],
  });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('no document.xml');
  return file.async('string');
}

/** The visible text of a document.xml fragment, in order (XML entities decoded). */
const textOf = (xml) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
  .map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
  .join('');

// What the editor makes of pasted markdown — headings, a quote, code, a rule,
// a list and a table, as the sanitiser stores them.
const BODY = [
  '<h2>Fire doors</h2>',
  '<p>Checked <strong>quarterly</strong>, with <s>old</s> notes.</p>',
  '<blockquote><p>Quoted advice</p></blockquote>',
  '<pre><code>line one\nline two</code></pre>',
  '<hr>',
  '<ul><li><p>First item</p></li><li><p>Second item</p></li></ul>',
  '<table><tbody>',
  '<tr><th colspan="1" rowspan="1"><p>Door</p></th><th><p>Result</p></th></tr>',
  '<tr><td><p>D1</p></td><td><p>Pass</p></td></tr>',
  '<tr><td><p>D2</p></td><td><p>Fail &amp; fix</p></td></tr>',
  '</tbody></table>',
  '<h4>Next steps</h4><p>Book the contractor.</p>',
].join('');

describe('parseHtmlToDocxParagraphs', () => {
  // ⛔ The fault this module was moved to fix: it read <p>, <ul> and <ol>
  // only, so a pasted heading or code block vanished from the printed report.
  it('loses no text from any block the editor can hold', async () => {
    const text = textOf(await packedXml(parseHtmlToDocxParagraphs(BODY)));
    for (const expected of [
      'Fire doors', 'quarterly', 'old', 'Quoted advice', 'line one', 'line two',
      'First item', 'Second item', 'Door', 'Result', 'D1', 'Pass', 'D2', 'Fail & fix',
      'Next steps', 'Book the contractor.',
    ]) expect(text).toContain(expected);
  });

  it('prints a pasted table as a real Word table, header row included', async () => {
    const xml = await packedXml(parseHtmlToDocxParagraphs(BODY));
    const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
    expect(tables).toHaveLength(1);
    const table = tables[0] ?? '';
    expect(table.match(/<w:tr[ >]/g)).toHaveLength(3);
    expect(table.match(/<w:tc>/g)).toHaveLength(6);
    // The grid, not only the cells, carries the widths — else Word sizes the
    // columns from a placeholder (tableGridGuard.test.js).
    expect(table.match(/<w:gridCol /g)).toHaveLength(2);
    expect(table).toMatch(/<w:tblLayout w:type="fixed"\/>/);
  });

  // ⛔ The complaint, 2026-09-28: on screen a column of two-digit numbers is
  // narrow, and in Word every column had the same width. Read from the packed
  // grid, which is what Word lays out from.
  it('sizes each column to its content, as the table is sized on screen', async () => {
    const xml = await packedXml(parseHtmlToDocxParagraphs(
      '<table><tbody>'
      + '<tr><th><p>#</p></th><th><p>Item</p></th><th><p>Notes</p></th></tr>'
      + '<tr><td><p>12</p></td><td><p>Fire doors</p></td><td><p>Closers on floors 3 to 7 need adjusting before the next survey, and two self-closers are missing entirely</p></td></tr>'
      + '<tr><td><p>13</p></td><td><p>EICR</p></td><td><p>Booked</p></td></tr>'
      + '</tbody></table>'));
    const grid = [...xml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => Number(m[1]));
    expect(grid).toHaveLength(3);
    const [num, item, notes] = grid;
    expect(num).toBeLessThan(item);
    expect(item).toBeLessThan(notes);
    expect(num * 4).toBeLessThan(notes);
    // The table still fits the page, and every cell agrees with its grid column.
    expect(num + item + notes).toBeLessThanOrEqual(10800);
    const cellWidths = [...xml.matchAll(/<w:tcW w:type="dxa" w:w="(\d+)"\/>|<w:tcW w:w="(\d+)" w:type="dxa"\/>/g)]
      .map((m) => Number(m[1] ?? m[2]));
    expect(cellWidths.slice(0, 3)).toEqual(grid);
  });

  it('pads a ragged row rather than dropping a column', async () => {
    const xml = await packedXml(parseHtmlToDocxParagraphs(
      '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th><th><p>C</p></th></tr>'
      + '<tr><td><p>1</p></td></tr></tbody></table>'));
    expect(xml.match(/<w:tc>/g)).toHaveLength(6);
  });

  it('keeps code in a monospace face, one paragraph per line', async () => {
    const xml = await packedXml(parseHtmlToDocxParagraphs('<pre><code>a = 1\nb = 2</code></pre>'));
    expect(xml).toMatch(/Courier New/);
    expect(xml.match(/<w:p>|<w:p /g)).toHaveLength(2);
  });

  it('still treats a legacy plain-text body as lines', async () => {
    const text = textOf(await packedXml(parseHtmlToDocxParagraphs('plain one\nplain two')));
    expect(text).toContain('plain one');
    expect(text).toContain('plain two');
  });
});

describe('autoColumnWidths', () => {
  const cell = (text, bold = false) => ({ lines: [text], bold });
  const total = (w) => w.reduce((t, n) => t + n, 0);

  it('uses natural widths when everything fits, so a short table stays narrow', () => {
    const w = autoColumnWidths([[cell('#', true), cell('Due', true)], [cell('12'), cell('March')]], 10800);
    expect(total(w)).toBeLessThan(10800 / 2);
    expect(w[0]).toBeLessThan(w[1]);
  });

  it('gives every column at least its longest word when the page is too narrow for the rest', () => {
    const long = 'word '.repeat(80).trim();
    const w = autoColumnWidths([[cell('12'), cell('Extraordinarily'), cell(long)]], 10800);
    expect(total(w)).toBeLessThanOrEqual(10800);
    expect(total(w)).toBeGreaterThan(10800 - 3);            // the page is used
    const perChar = 20 * 5.5;
    expect(w[1] - 200).toBeGreaterThanOrEqual('Extraordinarily'.length * perChar);
    expect(w[0]).toBeLessThan(w[2]);
  });

  it('never exceeds the page, even when the minimums alone would', () => {
    const huge = 'x'.repeat(200);
    const w = autoColumnWidths([[cell(huge), cell(huge)]], 5000);
    expect(total(w)).toBeLessThanOrEqual(5000);
    expect(w[0]).toBe(w[1]);
  });

  it('reads a multi-line cell by its longest line, and keeps an empty column', () => {
    const w = autoColumnWidths([[{ lines: ['a', 'much longer line'] }, { lines: [''] }]], 10800);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[1]).toBeGreaterThan(200);
  });
});

describe('htmlToText (the meeting minutes)', () => {
  it('ends the line at a heading, and separates table cells and rows', () => {
    const out = htmlToText(
      '<h2>Heading</h2><p>Para</p>'
      + '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr>'
      + '<tr><td><p>1</p></td><td><p>2 &amp; 3</p></td></tr></tbody></table>');
    const lines = out.split('\n').filter(Boolean);
    expect(lines).toEqual(['Heading', 'Para', 'A | B', '1 | 2 & 3']);
  });

  it('keeps lists and breaks as before', () => {
    expect(htmlToText('<ul><li><p>One</p></li><li><p>Two</p></li></ul>'))
      .toMatch(/^• One\n+• Two$/);
    expect(htmlToText('<p>a<br>b</p>')).toBe('a\nb');
    expect(htmlToText('plain')).toBe('plain');
  });
});
