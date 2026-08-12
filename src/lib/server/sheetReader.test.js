// src/lib/server/sheetReader.test.js
// The seam between exceljs and the pure preview layer.
//
// sheetPreview.test.js covers the decisions; this covers the thing those tests
// cannot: that a REAL workbook — written by exceljs, read back by exceljs —
// comes out the other side as the grid we expect. Format sniffing is exercised
// here too, because it is the difference between a table and a screen of binary.

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';

import { readSheetPreview } from './sheetReader.js';

/** Build a real .xlsx in memory. */
async function xlsxBuffer(rows, sheetName = 'Sheet1') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('readSheetPreview — xlsx', () => {
  it('reads a real workbook into a header and rows', async () => {
    const buffer = await xlsxBuffer([
      ['Document', 'Cost'],
      ['Roof works', 8400],
      ['Fire doors', 12250],
    ], 'Costs');

    const preview = await readSheetPreview(buffer);

    expect(preview.columns).toEqual(['Document', 'Cost']);
    expect(preview.rows).toEqual([['Roof works', '8400'], ['Fire doors', '12250']]);
    expect(preview.sheetName).toBe('Costs');
    expect(preview.totalRows).toBe(2);
  });

  it('keeps a blank row in the middle rather than closing the gap', async () => {
    // exceljs's eachRow() skips blanks, which would silently shift every row
    // below a gap up one — and a chronology read off a shifted grid is wrong
    // in a way nobody would spot.
    const buffer = await xlsxBuffer([['A'], ['one'], [], ['three']]);
    const preview = await readSheetPreview(buffer);

    expect(preview.rows).toEqual([['one'], [''], ['three']]);
  });

  it('shows a formula-s result', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('S');
    sheet.addRow(['Item', 'Cost']);
    sheet.addRow(['Roof', 8400]);
    sheet.getCell('B3').value = { formula: 'SUM(B2:B2)', result: 8400 };
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const preview = await readSheetPreview(buffer);
    expect(preview.rows.at(-1)).toContain('8400');
  });

  it('reads a date without a timezone shift', async () => {
    const buffer = await xlsxBuffer([['Date'], [new Date(2025, 6, 14)]]);
    const preview = await readSheetPreview(buffer);
    expect(preview.rows[0][0]).toBe('2025-07-14');
  });

  it('takes the FIRST worksheet when there are several', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('First').addRow(['A', 'B']);
    workbook.addWorksheet('Second').addRow(['X', 'Y']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    expect((await readSheetPreview(buffer)).sheetName).toBe('First');
  });

  it('reports an empty workbook as empty rather than throwing', async () => {
    const preview = await readSheetPreview(await xlsxBuffer([]));
    expect(preview.columns).toEqual([]);
    expect(preview.rows).toEqual([]);
  });
});

describe('readSheetPreview — format sniffing', () => {
  it('reads CSV bytes as CSV', async () => {
    // The type is sniffed, not taken from the caller: uploads routinely arrive
    // as octet-stream, and a wrong label means rendering binary as text.
    const preview = await readSheetPreview(
      Buffer.from('Document,Cost\nRoof works,8400\n', 'utf8'));

    expect(preview.columns).toEqual(['Document', 'Cost']);
    expect(preview.rows).toEqual([['Roof works', '8400']]);
  });

  it('reads a zip-signature buffer as a workbook, not as text', async () => {
    const buffer = await xlsxBuffer([['A'], ['1']]);
    expect(buffer[0]).toBe(0x50);          // 'P' — the branch under test
    expect((await readSheetPreview(buffer)).columns).toEqual(['A']);
  });

  it('rejects a zip that is not a workbook, so the caller can say so', async () => {
    // .ods lands here: exceljs cannot read it. Failing loudly is what lets the
    // route return a usable message instead of an empty table.
    const notAWorkbook = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64),
    ]);
    await expect(readSheetPreview(notAWorkbook)).rejects.toThrow();
  });
});
