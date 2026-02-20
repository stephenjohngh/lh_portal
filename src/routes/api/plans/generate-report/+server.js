// src/routes/api/plans/generate-report/+server.js
// Generate Word document report for a single floor plan.

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  ImageRun,
  WidthType, AlignmentType, HeadingLevel, BorderStyle
} from 'docx';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('generatePlanReport');

// ── Type initials — matches planConstants.js TYPE_INITIALS ─────────────────
const TYPE_INITIALS = {
  communal_door:  'D',
  apartment_door: 'A',
  light:          'L',
  fire_control:   'F'
};

// ── Display name: FloorCode/TypeInitial/AssetID e.g. "G/D/001" ───────────
function getElementDisplayName(element, floorLevel) {
  const floor = floorLevel !== null && floorLevel !== undefined ? String(floorLevel) : '?';
  const type  = TYPE_INITIALS[element.element_type] ?? '?';
  const id    = element.asset_id || 'No ID';
  return `${floor}/${type}/${id}`;
}

// ── Status label — 'active' → 'OK' ────────────────────────────────────────
function statusLabel(s) {
  return { active: 'OK', failed: 'Failed', inactive: 'Inactive',
           maintenance: 'Maintenance', removed: 'Removed' }[s] ?? s ?? '—';
}

// ── Sort elements by asset_id (numeric-aware) ─────────────────────────────
function sortByAssetId(a, b) {
  return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
}

// ── Detect image type from URL ────────────────────────────────────────────
function imageTypeFromUrl(url) {
  const lower = (url || '').toLowerCase();
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'jpg';
  if (lower.includes('.gif'))  return 'gif';
  if (lower.includes('.bmp'))  return 'bmp';
  return 'png'; // safe default
}

// ── Table borders ─────────────────────────────────────────────────────────
const BORDERS = {
  top:              { style: BorderStyle.SINGLE, size: 1 },
  bottom:           { style: BorderStyle.SINGLE, size: 1 },
  left:             { style: BorderStyle.SINGLE, size: 1 },
  right:            { style: BorderStyle.SINGLE, size: 1 },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
  insideVertical:   { style: BorderStyle.SINGLE, size: 1 }
};

function headerCell(text, size) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
    width: { size, type: WidthType.PERCENTAGE }
  });
}

function dataCell(text) {
  return new TableCell({ children: [new Paragraph(String(text ?? '—'))] });
}

// ── POST handler ──────────────────────────────────────────────────────────
export async function POST({ request }) {
  logger('📄 POST /api/plans/generate-report — request received');

  try {
    const { plan, elements, options } = await request.json();

    if (!plan || !elements || !options) {
      return json({ error: 'Missing plan, elements, or options' }, { status: 400 });
    }

    logger('Plan:', plan.name, '| Elements:', elements.length, '| Options:', options);

    const docSections = [];

    // ── Title ───────────────────────────────────────────────────────────────
    docSections.push(new Paragraph({
      text: 'Floor Plan Report',
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 }
    }));

    // ── Plan metadata ───────────────────────────────────────────────────────
    const metaRows = [
      ['Plan',        plan.name],
      ['Building',    plan.building],
      ['Floor Level', String(plan.floor_level ?? '—')],
      ['Total Elements', String(elements.length)],
    ];
    if (plan.description) metaRows.splice(3, 0, ['Description', plan.description]);

    for (const [label, value] of metaRows) {
      docSections.push(new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: `${label}: `, bold: true }),
          new TextRun(value)
        ]
      }));
    }

    // ── Plan image ──────────────────────────────────────────────────────────
    // Image is fetched client-side and sent as base64 — avoids server-side
    // outbound fetch issues with Supabase Storage URLs.
    if (options.includeImage && options.imageBase64) {
      const imgBuffer = Buffer.from(options.imageBase64, 'base64');
      const srcW  = plan.image_width  || 800;
      const srcH  = plan.image_height || 600;
      const maxW  = 600;  // points — fits A4 portrait with margins
      const scale = Math.min(1, maxW / srcW);
      const dispW = Math.round(srcW * scale);
      const dispH = Math.round(srcH * scale);

      docSections.push(new Paragraph({ spacing: { before: 300, after: 100 }, children: [] }));
      docSections.push(new Paragraph({
        spacing: { after: 300 },
        children: [
          new ImageRun({
            data: imgBuffer,
            type: 'png',  // canvas always exports PNG
            transformation: { width: dispW, height: dispH }
          })
        ]
      }));
      logger(`✅ Plan image embedded from base64 (${dispW}×${dispH}pt)`);

    } else if (options.includeImage && !options.imageBase64) {
      // Client couldn't fetch the image — insert a note
      docSections.push(new Paragraph({
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: '[Plan image could not be loaded]', italics: true, color: '888888' })]
      }));
    }

    // ── Element list ────────────────────────────────────────────────────────
    if (options.includeElementList && elements.length > 0) {

      if (options.groupByType) {
        const byType = elements.reduce((acc, el) => {
          (acc[el.element_type] = acc[el.element_type] || []).push(el);
          return acc;
        }, {});

        for (const type of Object.keys(byType).sort()) {
          const sorted = [...byType[type]].sort(sortByAssetId);
          const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

          docSections.push(new Paragraph({
            text: `${typeLabel}s (${sorted.length})`,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }));

          const rows = [
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
                dataCell(getElementDisplayName(el, plan.floor_level)),
                dataCell(el.label),
                dataCell(el.subtype),
                dataCell(statusLabel(el.status)),
                dataCell(el.notes),
              ]
            }))
          ];

          docSections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS }));
          docSections.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
        }

      } else {
        docSections.push(new Paragraph({
          text: 'All Elements',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }));

        const sorted = [...elements].sort((a, b) => {
          if (a.element_type !== b.element_type) return a.element_type.localeCompare(b.element_type);
          return sortByAssetId(a, b);
        });

        const rows = [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell('ID',      18),
              headerCell('Type',    10),
              headerCell('Label',   18),
              headerCell('Subtype', 14),
              headerCell('Status',  10),
              headerCell('Notes',   30),
            ]
          }),
          ...sorted.map(el => new TableRow({
            children: [
              dataCell(getElementDisplayName(el, plan.floor_level)),
              dataCell(el.element_type),
              dataCell(el.label),
              dataCell(el.subtype),
              dataCell(statusLabel(el.status)),
              dataCell(el.notes),
            ]
          }))
        ];

        docSections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS }));
      }
    }

    // ── Build and return document ───────────────────────────────────────────
    const doc    = new Document({ sections: [{ properties: {}, children: docSections }] });
    const buffer = await Packer.toBuffer(doc);
    logger('✅ Report generated, size:', buffer.byteLength);

    return new Response(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${plan.building}_${plan.name}_Report.docx"`
      }
    });

  } catch (error) {
    logger('❌ Error:', error.message, error.stack);
    return json({ error: error.message }, { status: 500 });
  }
}
