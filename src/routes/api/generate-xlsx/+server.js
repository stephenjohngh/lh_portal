// src/routes/api/generate-xlsx/+server.js
// Generate an Excel (.xlsx) report from data the client has already built.
//
// Thin on purpose. The workbook itself is built by `$lib/server/xlsxWorkbook.js`:
// a `+server.js` may only export HTTP verbs, so a builder living here could
// never be unit-tested — and document generation is exactly the kind of code
// that fails at runtime on something static analysis cannot see.
//
// The rows arrive PRE-FILTERED AND PRE-SORTED from the screen that asked for
// them, and nothing here re-derives any of it, so the workbook can never
// disagree with the list the user was looking at.
//
// Body:
//   { building, filterSummary, generatedAt,
//     detail:         { headers: string[], rows: string[][] },
//     floorSummaries: [{ floor, pivot, totals }],   // optional, components only
//     fullSummary:    { pivot, totals } | null,     // optional, components only
//     sheetName, reportTitle, filenameStem,          // optional naming
//     statusFill }                                   // optional { value: ARGB }
//
// ⚠ The DETAIL sheet is generic and serves any list; the summary sheets are the
// component status pivot and nothing else. Naming and the status palette were
// hardcoded to the components report until a second caller needed the same
// sheet builder — which is why they are parameters rather than a second,
// near-identical route.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger } from '$lib/utils/logger';
import { buildWorkbook, xlsxFilename } from '$lib/server/xlsxWorkbook.js';

const logger = getLogger('generateXlsx');

export async function POST({ request }) {
  // Authenticated users only — renders caller-supplied data into a document.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  logger('📊 POST /api/generate-xlsx');

  try {
    const body = await request.json();
    const wb = buildWorkbook(body);
    const buffer = await wb.xlsx.writeBuffer();

    logger('✅ XLSX generated, size:', buffer.byteLength, 'bytes');
    const filename = xlsxFilename(body.building, body.filenameStem);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (/** @type {any} */ err) {
    logger('❌ XLSX generation failed:', err);
    const message = err?.message ?? 'Failed to generate spreadsheet';
    // A missing detail matrix is the caller's fault, not ours.
    const status = /detail columns/i.test(message) ? 400 : 500;
    return json({ error: message }, { status });
  }
}
