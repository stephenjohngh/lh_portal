// src/routes/api/plans/generate-report/+server.js
// Generate Word document report for floor plan(s).
//
// Accepts two shapes:
//   Multi-floor:  { floors: [{ plan, elements, imageBase64 }], options }
//   Single-floor: { plan, elements, options }  ← backwards compatible
//
// Floors with 0 elements are excluded by the client before sending.

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow,
  ImageRun, PageBreak,
  WidthType, HeadingLevel,
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  hCell, dCell, makeHeader, makeFooter, DOC_STYLES, pageProps,
  CONTENT_W, COLOURS,
} from '$lib/server/docxHelpers';
import {
  elementDisplayId, statusLabel, sortByAssetId,
  floorDisplayLabel, floorSortKey,
} from '$lib/apps/plans/utils/reportHelpers';
import { fmtGenerated } from '$lib/utils/dates';

const logger = getLogger('generatePlanReport');

// ── Element table column widths (DXA, sum = CONTENT_W = 10466) ───────────────
// ID(1400) | Label(1800) | Subtype(1600) | Status(1000) | Notes(4666)
const COLS = [1400, 1800, 1600, 1000, 4666];

// ── Build content for one floor ───────────────────────────────────────────────
function buildFloorContent(plan, elements, options) {
  const children = [];
  const flLabel  = floorDisplayLabel(plan.floor_level);

  // Floor heading
  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { after: 200 },
    children: [new TextRun({
      text:  `${plan.building} — ${flLabel}`,
      font:  'Arial', size: 36, bold: true,
    })],
  }));

  // Metadata lines
  const meta = [
    ['Plan',     plan.name],
    ['Floor',    flLabel],
    ['Elements', String(elements.length)],
  ];
  if (plan.description) meta.splice(2, 0, ['Description', plan.description]);

  for (const [label, value] of meta) {
    children.push(new Paragraph({
      spacing:  { after: 80 },
      children: [
        new TextRun({ text: `${label}: `, bold: true,  font: 'Arial', size: 20 }),
        new TextRun({ text: value,        bold: false, font: 'Arial', size: 20 }),
      ],
    }));
  }

  // Filter summary
  if (options.filterSummary) {
    children.push(new Paragraph({
      spacing:  { after: 100 },
      children: [
        new TextRun({ text: 'Filters: ',       bold: true,   font: 'Arial', size: 20 }),
        new TextRun({ text: options.filterSummary, italics: true, color: '6b7280', font: 'Arial', size: 20 }),
      ],
    }));
  }

  // Annotated plan image (built client-side, passed as base64)
  if (options.includeImage && options.imageBase64) {
    const imgBuffer = Buffer.from(options.imageBase64, 'base64');
    const srcW  = plan.image_width  || 800;
    const srcH  = plan.image_height || 600;
    const maxW  = 600;
    const scale = Math.min(1, maxW / srcW);

    children.push(new Paragraph({
      spacing:  { before: 300, after: 300 },
      children: [new ImageRun({
        data:           imgBuffer,
        type:           'png',
        transformation: { width: Math.round(srcW * scale), height: Math.round(srcH * scale) },
      })],
    }));
  } else if (options.includeImage) {
    children.push(new Paragraph({
      spacing:  { after: 200 },
      children: [new TextRun({ text: '[Plan image could not be loaded]', italics: true, color: '888888', font: 'Arial', size: 18 })],
    }));
  }

  // Element tables grouped by type
  if (options.includeElementList && elements.length > 0) {
    const byType = elements.reduce((acc, el) => {
      (acc[el.element_type] = acc[el.element_type] || []).push(el);
      return acc;
    }, {});

    for (const type of Object.keys(byType).sort()) {
      const sorted    = [...byType[type]].sort(sortByAssetId);
      const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      children.push(new Paragraph({
        heading:  HeadingLevel.HEADING_2,
        spacing:  { before: 400, after: 200 },
        children: [new TextRun({ text: `${typeLabel}s (${sorted.length})`, font: 'Arial', size: 26, bold: true })],
      }));

      const headerRow = new TableRow({
        tableHeader: true,
        children: [
          hCell('ID',      COLS[0]),
          hCell('Label',   COLS[1]),
          hCell('Subtype', COLS[2]),
          hCell('Status',  COLS[3]),
          hCell('Notes',   COLS[4]),
        ],
      });

      const dataRows = sorted.map((el, idx) => {
        const alt  = idx % 2 === 1;
        const isFailed = el.status === 'failed';
        return new TableRow({
          children: [
            dCell(elementDisplayId(el, plan.floor_level), COLS[0], { alt, bold: true }),
            dCell(el.label,                               COLS[1], { alt }),
            dCell(el.subtype,                             COLS[2], { alt }),
            dCell(statusLabel(el.status),                 COLS[3], { alt, color: isFailed ? COLOURS.failRed : undefined, bold: isFailed }),
            dCell(el.notes,                               COLS[4], { alt }),
          ],
        });
      });

      children.push(new Table({
        width:        { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: COLS,
        rows:         [headerRow, ...dataRows],
      }));

      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    }
  }

  return children;
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST({ request }) {
  logger('📄 POST /api/plans/generate-report');

  try {
    const body = await request.json();

    // Normalise to floors[]
    let floors, options, building;

    if (body.floors) {
      floors   = body.floors;
      options  = body.options ?? {};
      building = options.building ?? floors[0]?.plan?.building ?? 'Building';
    } else {
      // Legacy single-floor shape
      floors   = [{ plan: body.plan, elements: body.elements, imageBase64: body.options?.imageBase64 }];
      options  = body.options ?? {};
      building = body.plan?.building ?? 'Building';
    }

    if (!floors?.length) return json({ error: 'No floor data supplied' }, { status: 400 });

    logger('Floors to render:', floors.length, '| Building:', building);

    const generatedAt = fmtGenerated();

    // Assemble document children
    const children = [];

    for (let i = 0; i < floors.length; i++) {
      const { plan, elements, imageBase64 } = floors[i];
      if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(...buildFloorContent(plan, elements, { ...options, imageBase64: imageBase64 ?? null }));
    }

    const doc = new Document({
      styles:   DOC_STYLES,
      sections: [{
        properties: pageProps(),
        headers:    { default: makeHeader(`${building} — Floor Plan Report`, generatedAt) },
        footers:    { default: makeFooter() },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    logger('✅ Report generated, size:', buffer.byteLength, '| floors:', floors.length);

    const safeBuilding = building.replace(/[^a-z0-9]/gi, '_');
    const floorSlug    = floors.length === 1
      ? `_Floor${floors[0].plan.floor_level}`
      : `_${floors.length}Floors`;
    const filename = `${safeBuilding}${floorSlug}_PlanReport.docx`;

    return new Response(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    logger('❌ Error:', error.message, error.stack);
    return json({ error: error.message }, { status: 500 });
  }
}
