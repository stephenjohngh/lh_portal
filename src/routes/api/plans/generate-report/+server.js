// src/routes/api/plans/generate-report/+server.js
// Generate Word document report for a single floor plan.

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  ImageRun,
  WidthType, HeadingLevel, BorderStyle
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import { elementDisplayId, statusLabel, sortByAssetId } from '$lib/apps/plans/utils/reportHelpers';

const logger = getLogger('generatePlanReport');

// ── Table helpers ─────────────────────────────────────────────────────────
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

    logger('Plan:', plan.name, '| Elements:', elements.length);

    const docSections = [];

    // ── Title ──────────────────────────────────────────────────────────────
    docSections.push(new Paragraph({
      text: 'Floor Plan Report',
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 }
    }));

    // ── Plan metadata ──────────────────────────────────────────────────────
    const metaRows = [
      ['Plan',             plan.name],
      ['Building',         plan.building],
      ['Floor Level',      String(plan.floor_level ?? '—')],
      ['Total Elements',   String(elements.length)],
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

    // ── Filter summary ─────────────────────────────────────────────────────
    if (options.filterSummary) {
      docSections.push(new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: 'Filters: ', bold: true }),
          new TextRun({ text: options.filterSummary, italics: true, color: '6b7280' })
        ]
      }));
    }

    // ── Plan image ─────────────────────────────────────────────────────────
    // Fetched client-side and sent as base64 — avoids server-side fetch issues.
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
            type: 'png',
            transformation: { width: dispW, height: dispH }
          })
        ]
      }));
      logger(`✅ Plan image embedded (${dispW}×${dispH}pt)`);

    } else if (options.includeImage) {
      docSections.push(new Paragraph({
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: '[Plan image could not be loaded]', italics: true, color: '888888' })]
      }));
    }

    // ── Element list — always grouped by type ──────────────────────────────
    if (options.includeElementList && elements.length > 0) {
      const byType = elements.reduce((acc, el) => {
        (acc[el.element_type] = acc[el.element_type] || []).push(el);
        return acc;
      }, {});

      for (const type of Object.keys(byType).sort()) {
        const sorted    = [...byType[type]].sort(sortByAssetId);
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
              dataCell(elementDisplayId(el, plan.floor_level)),
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
    }

    // ── Build and return document ──────────────────────────────────────────
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
