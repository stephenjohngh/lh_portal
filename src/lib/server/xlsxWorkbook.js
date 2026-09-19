// src/lib/server/xlsxWorkbook.js
//
// Builds the .xlsx workbook for /api/generate-xlsx.
//
// ⛔ It lives HERE rather than in the route because a `+server.js` may only
// export HTTP verbs, so a builder inside one can never be unit-tested — and
// document generation is exactly the kind of code that fails at runtime on
// something static analysis cannot see. Same reasoning as `complianceDocx.js`.
//
// ⚠ PRESENTATION ONLY. The caller supplies every value; nothing is re-derived
// here, so a workbook cannot disagree with the list the person was looking at
// when they asked for it.
//
// The DETAIL sheet is generic — `{headers, rows}` in, styled grid out, serving
// any list. The SUMMARY sheets are the component status pivot and nothing else.

import ExcelJS from 'exceljs';

const HEADER_FILL = 'FF1E293B';   // slate-800
const SUMMARY_HEADERS = ['System', 'Type', 'OK', 'Problem', 'Failed', 'Inactive', 'Total'];

/** Bold white-on-dark styling for a header row. */
function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle' };
  });
}

/** Size each column to the widest cell in it (capped). */
function autoWidth(ws, headers, rows) {
  ws.columns = headers.map((h, i) => {
    let max = String(h ?? '').length;
    for (const r of rows) max = Math.max(max, String(r[i] ?? '').length);
    return { width: Math.min(Math.max(max + 2, 8), 48) };
  });
}

/** A status-pivot sheet: optional titled blocks of System|Type|counts + total. */
function addSummarySheet(wb, name, blocks) {
  const ws = wb.addWorksheet(name);
  for (const block of blocks) {
    if (block.title) {
      const tr = ws.addRow([block.title]);
      tr.font = { bold: true, size: 12 };
      ws.mergeCells(tr.number, 1, tr.number, SUMMARY_HEADERS.length);
    }
    styleHeaderRow(ws.addRow(SUMMARY_HEADERS));
    for (const r of block.pivot ?? []) {
      ws.addRow([r.system_name, r.type_name, r.ok, r.problem, r.failed, r.inactive, r.total]);
    }
    if (block.totals) {
      const t = block.totals;
      ws.addRow(['', 'TOTAL', t.ok, t.problem, t.failed, t.inactive, t.total]).font = { bold: true };
    }
    ws.addRow([]); // spacer between blocks
  }
  ws.columns.forEach((col, i) => { col.width = i < 2 ? 24 : 10; });
}

/**
 * @param {Object} payload — see the route's header comment for the full shape.
 * @returns {ExcelJS.Workbook}
 * @throws {Error} when no detail columns were supplied.
 */
export function buildWorkbook(payload = {}) {
  const {
    building = 'Lancaster House',
    filterSummary = '',
    generatedAt = '',
    detail = { headers: [], rows: [] },
    floorSummaries = [],
    fullSummary = null,
    sheetName = 'Components',
    reportTitle = 'Component Report',
    statusFill = null,
  } = payload;

  if (!Array.isArray(detail.headers) || detail.headers.length === 0) {
    throw new Error('No detail columns supplied.');
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LH Portal';
  wb.created = new Date();
  wb.title = `${building} — ${reportTitle}`;

  const ws = wb.addWorksheet(sheetName);

  // ⛔ THE BANNER. `filterSummary` and `generatedAt` used to arrive here and be
  // DROPPED — destructured, never written — so every export said nothing about
  // what it had been filtered to. A 40-row extract of 1,092 components was
  // indistinguishable from a building with 40 components once the file was off
  // the screen. An extract has to say that it is one.
  const titleRow = ws.addRow([`${building} — ${reportTitle}`]);
  titleRow.font = { bold: true, size: 14 };
  const context = [filterSummary, generatedAt ? `Generated ${generatedAt}` : '']
    .filter(Boolean).join('   ·   ');
  if (context) {
    ws.addRow([context]).font = { italic: true, color: { argb: 'FF475569' } };
  }
  ws.addRow([]);

  const headerRow = ws.addRow(detail.headers);
  for (const r of detail.rows) ws.addRow(r);
  styleHeaderRow(headerRow);
  autoWidth(ws, detail.headers, detail.rows);

  // ⚠ Freeze and filter from the HEADER row, not row 1 — the banner is above it.
  ws.views = [{ state: 'frozen', ySplit: headerRow.number }];
  ws.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: detail.headers.length },
  };

  // Colour the status column, when the CALLER supplied a palette. It used to be
  // a hardcoded component palette applied to any column called "Status", which
  // would have silently mis-coloured a list whose statuses mean something else.
  // Matched case-insensitively, so a palette may be keyed on stored values
  // ("ok") or on printed labels ("Not covered").
  const paletteEntries = Object.entries(statusFill ?? {});
  if (paletteEntries.length) {
    const header = detail.headers.find(h => /status/i.test(String(h)));
    const col = header ? detail.headers.indexOf(header) + 1 : 0;
    if (col > 0) {
      const palette = new Map(paletteEntries.map(([k, v]) => [k.toLowerCase(), v]));
      for (let i = headerRow.number + 1; i <= ws.rowCount; i++) {
        const cell = ws.getCell(i, col);
        const fill = palette.get(String(cell.value ?? '').toLowerCase());
        if (fill) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        }
      }
    }
  }

  if (fullSummary?.pivot?.length) {
    addSummarySheet(wb, 'Full Summary', [{ title: null, pivot: fullSummary.pivot, totals: fullSummary.totals }]);
  }
  if (floorSummaries.length) {
    addSummarySheet(wb, 'By Floor', floorSummaries.map(f => ({ title: f.floor, pivot: f.pivot, totals: f.totals })));
  }

  return wb;
}

/** `Building_Stem_YYYY-MM-DD.xlsx`, with anything awkward replaced. */
export function xlsxFilename(building = 'Lancaster House', filenameStem = 'Components') {
  const safe = (s) => String(s).replace(/[^a-z0-9]/gi, '_');
  return `${safe(building)}_${safe(filenameStem)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
}
