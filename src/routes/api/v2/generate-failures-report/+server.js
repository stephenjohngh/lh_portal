// src/routes/api/v2/generate-failures-report/+server.js
//
// Pre-configured "Failed Components" report.
// Shows every component currently at 'failed' status, grouped by floor,
// with the notes from its most recent inspection walk.
//
// Request body:
//   {
//     building:    string,
//     generatedAt: string,
//     floors: [
//       {
//         floor: { id, short_name, name, level_order },
//         components: [
//           {
//             asset_id, label, type_code, type_name, type_initial,
//             system_name, primary_attribute,
//             attributes: [{ name, value }],
//             last_inspected: ISO string | null,   // null = never inspected
//             last_notes:     string | null,
//           }
//         ]
//       }
//     ]
//   }

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow,
  PageBreak,
  WidthType, HeadingLevel, TableLayoutType,
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  hCell, dCell, run, para,
  makeHeader, makeFooter, DOC_STYLES, pageProps,
  CONTENT_W, COLOURS, BORDERS,
} from '$lib/server/docxHelpers.js';
import { fmtGenerated, fmtDate, fmtDateTime } from '$lib/utils/dates';

const logger = getLogger('v2GenerateFailuresReport');

// ── Failures table ─────────────────────────────────────────────────────────────
// Columns: System | Type | Ref | Label | Attributes | Inspected | Notes
// DXA:      1200  | 1400 | 950 | 1100  |    1800    |    950    | 3066
// Sum = 10466
const FAIL_COLS = [1200, 1400, 950, 1100, 1800, 950, 3066];

function buildFailuresTable(components) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('System',     FAIL_COLS[0]),
      hCell('Type',       FAIL_COLS[1]),
      hCell('Ref',        FAIL_COLS[2]),
      hCell('Label',      FAIL_COLS[3]),
      hCell('Attributes', FAIL_COLS[4]),
      hCell('Inspected',  FAIL_COLS[5]),
      hCell('Notes',      FAIL_COLS[6]),
    ],
  });

  const dataRows = components.map((c, idx) => {
    const alt   = idx % 2 === 1;
    const ref   = `${c.floor_short ?? '?'}/${c.type_initial ?? '?'}/${c.asset_id ?? '?'}`;
    const attrs = (c.attributes ?? []).map(a => `${a.name}: ${a.value}`).join('\n');
    const insp  = c.last_inspected
      ? fmtDateTime(c.last_inspected)
      : '— Never inspected';
    const notesText = c.last_notes?.trim() || '—';

    return new TableRow({
      children: [
        dCell(c.system_name      ?? '—', FAIL_COLS[0], { alt }),
        dCell(c.type_name        ?? '—', FAIL_COLS[1], { alt }),
        dCell(ref,                        FAIL_COLS[2], { alt, bold: true }),
        dCell(c.label            ?? '—', FAIL_COLS[3], { alt }),
        dCell(attrs || '—',               FAIL_COLS[4], { alt }),
        dCell(insp,                       FAIL_COLS[5], { alt, color: c.last_inspected ? undefined : COLOURS.textMuted }),
        dCell(notesText,                  FAIL_COLS[6], { alt, color: c.last_notes ? COLOURS.failRed : undefined }),
      ],
    });
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: FAIL_COLS,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows],
  });
}

// ── POST handler ───────────────────────────────────────────────────────────────
export async function POST({ request }) {
  logger('📄 POST /api/v2/generate-failures-report');

  try {
    const { building, generatedAt, floors } = await request.json();

    if (!floors?.length) return json({ error: 'No floor data supplied' }, { status: 400 });

    const genAt      = generatedAt || fmtGenerated();
    const totalFails = floors.reduce((n, f) => n + (f.components?.length ?? 0), 0);
    const title      = `${building ?? 'Lancaster House'} — Failed Components Report`;

    const children = [];

    // ── Cover ────────────────────────────────────────────────────────────────
    children.push(new Paragraph({
      spacing:  { after: 200 },
      children: [new TextRun({ text: title, font: 'Arial', size: 48, bold: true, color: COLOURS.failRed })],
    }));
    children.push(new Paragraph({
      spacing:  { after: 80 },
      children: [new TextRun({ text: `Generated: ${genAt}`, font: 'Arial', size: 20, color: COLOURS.textMuted })],
    }));
    children.push(new Paragraph({
      spacing:  { after: 80 },
      children: [new TextRun({
        text: `${totalFails} failed component${totalFails !== 1 ? 's' : ''} across ${floors.length} floor${floors.length !== 1 ? 's' : ''}`,
        font: 'Arial', size: 20, color: COLOURS.textMuted,
      })],
    }));
    children.push(new Paragraph({
      spacing:  { after: 400 },
      children: [new TextRun({
        text: 'Notes shown are from the most recent inspection walk for each component.',
        font: 'Arial', size: 18, italics: true, color: COLOURS.textMuted,
      })],
    }));

    // ── Per-floor sections ────────────────────────────────────────────────────
    for (let fi = 0; fi < floors.length; fi++) {
      const { floor, components = [] } = floors[fi];

      if (fi > 0) children.push(new Paragraph({ children: [new PageBreak()] }));

      // Floor heading
      children.push(new Paragraph({
        heading:  HeadingLevel.HEADING_2,
        spacing:  { before: 0, after: 160 },
        children: [run(
          `Floor ${floor.short_name} — ${floor.name}  (${components.length} failed)`,
          { size: 26, bold: true, color: COLOURS.failRed }
        )],
      }));

      if (components.length === 0) {
        children.push(para('No failed components on this floor.', { after: 120, color: COLOURS.textMuted }));
        continue;
      }

      children.push(buildFailuresTable(components));
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    }

    // ── Build document ────────────────────────────────────────────────────────
    const doc = new Document({
      styles:   DOC_STYLES,
      sections: [{
        properties: pageProps(),
        headers:    { default: makeHeader(title, genAt) },
        footers:    { default: makeFooter() },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    logger('✅ Failures report generated | components:', totalFails, '| size:', buffer.byteLength);

    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `Failed_Components_${dateSlug}.docx`;

    return new Response(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (err) {
    logger('❌ Error:', err.message, err.stack);
    return json({ error: err.message }, { status: 500 });
  }
}
