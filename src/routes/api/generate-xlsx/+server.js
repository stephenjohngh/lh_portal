// src/routes/api/generate-xlsx/+server.js
// Generate a multi-sheet Excel (.xlsx) report for building asset components.
//
// The client (xlsxReportGenerator.js) builds ALL the data via the shared report
// model (buildComponentsMatrix + buildStatusPivot) and posts it here; this
// endpoint is PRESENTATION ONLY — it styles the supplied matrix/pivots into a
// workbook with ExcelJS. That keeps the data logic identical to the CSV (same
// matrix) and the Word summaries (same pivot).
//
// Body:
//   { building, filterSummary, generatedAt,
//     detail:         { headers: string[], rows: string[][] },
//     floorSummaries: [{ floor, pivot, totals }],   // optional
//     fullSummary:    { pivot, totals } | null }     // optional
// Sheets: Components (always) · Full Summary · By Floor.

import { json } from '@sveltejs/kit';
import ExcelJS from 'exceljs';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('generateXlsx');

const HEADER_FILL  = 'FF1E293B';   // slate-800
const STATUS_FILL  = { ok: 'FF15803D', problem: 'FFB45309', failed: 'FFB91C1C', inactive: 'FF6B7280' };
const SUMMARY_HEADERS = ['System', 'Type', 'OK', 'Problem', 'Failed', 'Inactive', 'Total'];

/** Bold white-on-dark header styling for row 1 of a sheet. */
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

export async function POST({ request }) {
  // Authenticated users only — renders caller-supplied data into a document.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  logger('📊 POST /api/generate-xlsx');

  try {
    const body = await request.json();
    const {
      building       = 'Lancaster House',
      filterSummary  = '',
      generatedAt    = '',
      detail         = { headers: [], rows: [] },
      floorSummaries = [],
      fullSummary    = null,
    } = body;

    if (!Array.isArray(detail.headers) || detail.headers.length === 0) {
      return json({ error: 'No detail columns supplied.' }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'LH Portal';
    wb.created  = new Date();
    wb.title    = `${building} — Component Report`;

    // ── Components sheet (detail matrix) ──────────────────────────────────────
    const ws = wb.addWorksheet('Components', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(detail.headers);
    for (const r of detail.rows) ws.addRow(r);
    styleHeaderRow(ws.getRow(1));
    autoWidth(ws, detail.headers, detail.rows);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: detail.headers.length } };

    // Colour the Status column cells (matches the Word report palette).
    const statusCol = detail.headers.indexOf('Status') + 1;
    if (statusCol > 0) {
      for (let i = 2; i <= ws.rowCount; i++) {
        const cell = ws.getCell(i, statusCol);
        const fill = STATUS_FILL[String(cell.value ?? '').toLowerCase()];
        if (fill) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        }
      }
    }

    // ── Summary sheets ────────────────────────────────────────────────────────
    if (fullSummary?.pivot?.length) {
      addSummarySheet(wb, 'Full Summary', [{ title: null, pivot: fullSummary.pivot, totals: fullSummary.totals }]);
    }
    if (floorSummaries.length) {
      addSummarySheet(wb, 'By Floor', floorSummaries.map(f => ({ title: f.floor, pivot: f.pivot, totals: f.totals })));
    }

    const buffer = await wb.xlsx.writeBuffer();
    logger('✅ XLSX generated, size:', buffer.byteLength, 'bytes');

    const safeBuilding = building.replace(/[^a-z0-9]/gi, '_');
    const dateSlug     = new Date().toISOString().slice(0, 10);
    const filename     = `${safeBuilding}_Components_${dateSlug}.xlsx`;

    return new Response(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    logger('❌ Error:', err.message, err.stack);
    return json({ error: err.message }, { status: 500 });
  }
}
