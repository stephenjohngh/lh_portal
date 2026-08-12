// src/lib/server/sheetReader.js
// Reading a spreadsheet's first rows, server-side.
//
// Separate from the route that calls it for two reasons: SvelteKit endpoints
// may only export HTTP verbs, and P3's token-scoped published-pack route will
// need exactly this — it should import it, not reimplement it.
//
// Why the server: exceljs is about a megabyte. Shipping it to every reader of
// every page to preview the occasional schedule is a bad trade, and the parse
// belongs where the bytes already are.

import ExcelJS from 'exceljs';
import { buildSheetPreview, parseCsv } from '$lib/apps/dossier/utils/sheetPreview.js';

/** Above this we decline rather than pull a whole workbook into memory to show 12 rows. */
export const MAX_SHEET_BYTES = 15 * 1024 * 1024;

/** OOXML (and ODF) files are ZIP archives; anything else we treat as text. */
function isZip(buffer) {
  return buffer.length > 4
    && buffer[0] === 0x50 && buffer[1] === 0x4b       // 'PK'
    && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
}

/**
 * Read the first worksheet of a spreadsheet into a bounded preview.
 *
 * The format is SNIFFED, not taken from the caller or from the stored mime
 * type: uploads routinely arrive as octet-stream, and a wrong label would mean
 * parsing an xlsx as text and rendering a screen of binary.
 *
 * Throws for anything exceljs cannot read — .xls and .ods both land there — so
 * the caller can say so plainly instead of returning an empty table.
 *
 * @param {Buffer} buffer
 * @returns {Promise<object>} a buildSheetPreview() result
 */
export async function readSheetPreview(buffer) {
  if (!isZip(buffer)) {
    return buildSheetPreview(parseCsv(buffer.toString('utf8')));
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets?.[0];
  if (!sheet) return buildSheetPreview([]);

  const grid = [];
  // eachRow() skips blank rows entirely, which would silently close up a gap in
  // the middle of a sheet and shift every row below it up one — wrong in a way
  // nobody would spot. So walk the row range instead.
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells = [];
    for (let c = 1; c <= sheet.columnCount; c++) cells.push(row.getCell(c).value);
    grid.push(cells);
  }

  return buildSheetPreview(grid, { sheetName: sheet.name ?? '' });
}
