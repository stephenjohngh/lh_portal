// src/lib/docx/docxTableXml.js — Word tables written as XML text, for reports
// too big for the docx library's tables.
//
// ⛔ WHY (2026-10-05). docx packs a document by building an intermediate copy of
// every element, several times the size of the document itself, and the cost is
// per table cell. The Building Assets report has a row per component — 1,092 on
// this building — and through docx it needed 200–300 MB even with lean cells.
// Northflank's free tier gives the whole app 256 MB, of which the running app
// uses about 160: nine floors thrashed the garbage collector for ten minutes,
// eleven ran out of memory. Written as text, a table costs about what the text
// itself costs.
//
// How it is used: the report builds everything else with docx, puts a
// placeholder paragraph where each big table goes (tablePlaceholder), packs the
// document, then swaps each placeholder for its table XML (fillTablePlaceholders).
//
// ⚠ The XML here mirrors what docx itself writes for the same table — a table's
// borders and cell margins said once on the table, the document default font
// (Arial 9pt, DOC_STYLES), white by leaving a cell unshaded. Element order
// follows the WordprocessingML schema (Word refuses a document with tcPr or rPr
// children out of order). docxTableXml.test.js holds it to docx's own output.
import JSZip from 'jszip';
import { Paragraph, TextRun } from 'docx';

/** Characters XML 1.0 forbids outright; Word refuses a file containing one. */
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** @param {unknown} text */
export function xmlText(text) {
  return String(text ?? '')
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * One run. Only what differs from the document default is stated.
 * @param {unknown} text
 * @param {{ size?: number, bold?: boolean, italics?: boolean, color?: string }} [opts]
 */
export function runXml(text, { size, bold, italics, color } = {}) {
  let rPr = '';
  if (bold) rPr += '<w:b/><w:bCs/>';
  if (italics) rPr += '<w:i/><w:iCs/>';
  if (color) rPr += `<w:color w:val="${xmlText(color)}"/>`;
  if (size && size !== 18) rPr += `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`;
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

/** A line break inside a cell. */
export const BREAK_XML = '<w:r><w:br/></w:r>';

/**
 * One cell. No borders or margins of its own — the table carries those.
 * @param {string} runs   runXml(...) strings, joined
 * @param {number} widthDxa
 * @param {{ fill?: string, align?: 'center'|'right', columnSpan?: number, vAlign?: boolean }} [opts]
 */
export function cellXml(runs, widthDxa, { fill, align, columnSpan, vAlign = true } = {}) {
  let tcPr = `<w:tcW w:type="dxa" w:w="${widthDxa}"/>`;
  if (columnSpan) tcPr += `<w:gridSpan w:val="${columnSpan}"/>`;
  if (fill && fill.toUpperCase() !== 'FFFFFF') tcPr += `<w:shd w:fill="${xmlText(fill)}" w:val="clear"/>`;
  if (vAlign) tcPr += '<w:vAlign w:val="center"/>';
  const pPr = `<w:spacing w:after="0" w:before="0"/>${align ? `<w:jc w:val="${align}"/>` : ''}`;
  return `<w:tc><w:tcPr>${tcPr}</w:tcPr><w:p><w:pPr>${pPr}</w:pPr>${runs}</w:p></w:tc>`;
}

/** One row; a header row repeats at the top of each page. */
export function rowXml(cells, { header = false } = {}) {
  return `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.join('')}</w:tr>`;
}

/**
 * A whole table: fixed layout, the grid, borders and cell margins said once.
 * @param {{ width: number, columnWidths: number[], rows: string[],
 *           border: { size: number, color: string },
 *           margins: { top: number, bottom: number, left: number, right: number } }} t
 */
export function tableXml({ width, columnWidths, rows, border, margins }) {
  const b = (side) => `<w:${side} w:val="single" w:color="${border.color}" w:sz="${border.size}"/>`;
  const m = (side) => `<w:${side} w:type="dxa" w:w="${margins[side]}"/>`;
  return '<w:tbl><w:tblPr>'
    + `<w:tblW w:type="dxa" w:w="${width}"/>`
    + `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('')}</w:tblBorders>`
    + '<w:tblLayout w:type="fixed"/>'
    + `<w:tblCellMar>${['top', 'left', 'bottom', 'right'].map(m).join('')}</w:tblCellMar>`
    + '</w:tblPr>'
    + `<w:tblGrid>${columnWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + rows.join('')
    + '</w:tbl>';
}

const TOKEN = (i) => `@@LH-TABLE-${i}@@`;

/**
 * A placeholder paragraph for table `i`, and the collection that remembers it.
 * @returns {{ tables: string[], placeholder: (xml: string) => Paragraph }}
 */
export function tableSlots() {
  /** @type {string[]} */
  const tables = [];
  return {
    tables,
    placeholder(xml) {
      tables.push(xml);
      return new Paragraph({ children: [new TextRun(TOKEN(tables.length - 1))] });
    },
  };
}

/**
 * Swap each placeholder paragraph in a packed .docx for its table.
 * Throws if any placeholder is not found exactly once — a table silently
 * missing from a report is worse than no report.
 * Runs in a browser or on the server: bytes in, bytes out, no Node Buffer.
 * @param {Uint8Array|ArrayBuffer} docxBuffer
 * @param {string[]} tables
 * @returns {Promise<Uint8Array>}
 */
export async function fillTablePlaceholders(docxBuffer, tables) {
  if (!tables.length) return new Uint8Array(docxBuffer);
  const zip = await JSZip.loadAsync(docxBuffer);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('The packed document has no word/document.xml.');
  const xml = await file.async('string');

  let found = 0;
  const filled = xml.replace(/<w:p>(?:(?!<\/w:p>)[\s\S])*?@@LH-TABLE-(\d+)@@[\s\S]*?<\/w:p>/g, (_, i) => {
    found++;
    const t = tables[Number(i)];
    if (t == null) throw new Error(`No table for placeholder ${i}.`);
    return t;
  });
  if (found !== tables.length) {
    throw new Error(`Report tables: ${tables.length} built, ${found} placed.`);
  }

  zip.file('word/document.xml', filled);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
