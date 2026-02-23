// src/routes/api/plans/generate-report/+server.js
// Generate Word document report for floor plan(s).
//
// Accepts two shapes:
//   Multi-floor:  { floors: [{ plan, elements, imageBase64 }], options }
//   Single-floor: { plan, elements, options }  ← backwards compatible
//
// For multi-floor: one page break between floors, floors with 0 elements are
// already excluded by the client before sending.

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  ImageRun, PageBreak,
  WidthType, HeadingLevel, BorderStyle,
  Header, Footer, PageNumber, AlignmentType
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import { elementDisplayId, statusLabel, sortByAssetId } from '$lib/apps/plans/utils/reportHelpers';

const logger = getLogger('generatePlanReport');

// ── Page geometry (A4 portrait) ───────────────────────────────────────────────
const PAGE_W    = 11906;
const PAGE_H    = 16838;
const MARGIN    = 720;
const CONTENT_W = PAGE_W - 2 * MARGIN;   // 10466 DXA

// ── Table helpers ─────────────────────────────────────────────────────────────
const BORDERS = {
  top:              { style: BorderStyle.SINGLE, size: 1 },
  bottom:           { style: BorderStyle.SINGLE, size: 1 },
  left:             { style: BorderStyle.SINGLE, size: 1 },
  right:            { style: BorderStyle.SINGLE, size: 1 },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
  insideVertical:   { style: BorderStyle.SINGLE, size: 1 }
};

function headerCell(text, pct) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, font: 'Arial', size: 18 })] })],
    width: { size: pct, type: WidthType.PERCENTAGE }
  });
}

function dataCell(text) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: String(text ?? '—'), font: 'Arial', size: 18 })]
    })]
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 100, before: opts.before ?? 0 },
    children: [new TextRun({ text, font: 'Arial', size: opts.size ?? 20, bold: opts.bold ?? false,
                              italics: opts.italics ?? false, color: opts.color })],
    ...(opts.heading ? { heading: opts.heading } : {})
  });
}

// ── Build content for one floor ───────────────────────────────────────────────
function buildFloorContent(plan, elements, options) {
  const children = [];

  const floorLabel = (() => {
    const map = { L: 'Lower', U: 'Upper', G: 'Ground', '1': 'First', '2': 'Second',
                  '3': 'Third', '4': 'Fourth', '5': 'Fifth', '6': 'Sixth', '7': 'Seventh' };
    const v = String(plan.floor_level ?? '');
    return map[v] ? `Floor ${v} — ${map[v]}` : `Floor ${v}`;
  })();

  // Floor heading
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
    children: [new TextRun({ text: `${plan.building} — ${floorLabel}`, font: 'Arial', size: 36, bold: true })]
  }));

  // Metadata
  const meta = [
    ['Plan',   plan.name],
    ['Floor',  floorLabel],
    ['Elements', String(elements.length)],
  ];
  if (plan.description) meta.splice(2, 0, ['Description', plan.description]);

  for (const [label, value] of meta) {
    children.push(new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: `${label}: `, bold: true, font: 'Arial', size: 20 }),
        new TextRun({ text: value, font: 'Arial', size: 20 })
      ]
    }));
  }

  // Filter summary
  if (options.filterSummary) {
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({ text: 'Filters: ', bold: true, font: 'Arial', size: 20 }),
        new TextRun({ text: options.filterSummary, italics: true, color: '6b7280', font: 'Arial', size: 20 })
      ]
    }));
  }

  // Annotated plan image
  if (options.includeImage && options.imageBase64) {
    const imgBuffer = Buffer.from(options.imageBase64, 'base64');
    const srcW  = plan.image_width  || 800;
    const srcH  = plan.image_height || 600;
    const maxW  = 600;   // points — fits A4 portrait with margins
    const scale = Math.min(1, maxW / srcW);

    children.push(new Paragraph({ spacing: { before: 300, after: 300 }, children: [
      new ImageRun({
        data: imgBuffer,
        type: 'png',
        transformation: { width: Math.round(srcW * scale), height: Math.round(srcH * scale) }
      })
    ]}));
  } else if (options.includeImage) {
    children.push(para('[Plan image could not be loaded]', { italics: true, color: '888888', after: 200 }));
  }

  // Element list grouped by type
  if (options.includeElementList && elements.length > 0) {
    const byType = elements.reduce((acc, el) => {
      (acc[el.element_type] = acc[el.element_type] || []).push(el);
      return acc;
    }, {});

    for (const type of Object.keys(byType).sort()) {
      const sorted    = [...byType[type]].sort(sortByAssetId);
      const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
        children: [new TextRun({ text: `${typeLabel}s (${sorted.length})`, font: 'Arial', size: 26, bold: true })]
      }));

      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: BORDERS,
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell('ID',      20),
              headerCell('Label',   20),
              headerCell('Subtype', 15),
              headerCell('Status',  10),
              headerCell('Notes',   35),
            ]
          }),
          ...sorted.map(el => new TableRow({
            children: [
              dataCell(elementDisplayId(el, plan.floor_level)),
              dataCell(el.label),
              dataCell(el.subtype),
              dataCell(statusLabel(el.status)),
              dataCell(el.notes),
            ]
          }))
        ]
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
    // Client sends either { floors, options } or legacy { plan, elements, options }
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

    const generatedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    // ── Assemble document content ─────────────────────────────────────────────
    const children = [];

    for (let i = 0; i < floors.length; i++) {
      const { plan, elements, imageBase64 } = floors[i];

      // Page break between floors (not before the first)
      if (i > 0) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }

      // Pass imageBase64 through options for buildFloorContent
      const floorOptions = { ...options, imageBase64: imageBase64 ?? null };
      children.push(...buildFloorContent(plan, elements, floorOptions));
    }

    // ── Build document ────────────────────────────────────────────────────────
    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 20 } } }
      },
      sections: [{
        properties: {
          page: {
            size:   { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
          }
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [
                new TextRun({ text: `${building} — Floor Plan Report`, font: 'Arial', size: 18, color: '555555' }),
                new TextRun({ text: '\t', font: 'Arial' }),
                new TextRun({ text: generatedAt, font: 'Arial', size: 18, color: '888888' })
              ],
              tabStops: [{ type: 'right', position: CONTENT_W }],
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C8D0DC', space: 4 } }
            })]
          })
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: 'Page ', font: 'Arial', size: 16, color: '888888' }),
                new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '888888' }),
                new TextRun({ text: ' of ', font: 'Arial', size: 16, color: '888888' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 16, color: '888888' })
              ]
            })]
          })
        },
        children
      }]
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
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error) {
    logger('❌ Error:', error.message, error.stack);
    return json({ error: error.message }, { status: 500 });
  }
}
