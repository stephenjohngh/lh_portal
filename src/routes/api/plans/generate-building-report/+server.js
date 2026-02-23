// src/routes/api/plans/generate-building-report/+server.js
// Generates a Word document building report spanning all floors.
// Sorted by floor (canonical order) then by asset ID.

import { json }         from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow,
  PageBreak,
  WidthType, HeadingLevel, AlignmentType,
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  hCell, dCell, makeHeader, makeFooter, DOC_STYLES, pageProps,
  CONTENT_W, COLOURS,
} from '$lib/server/docxHelpers';
import {
  elementDisplayId, statusLabel, trunc, sortByAssetId, subtypeSummary,
  floorSortKey, floorDisplayLabel,
} from '$lib/apps/plans/utils/reportHelpers';
import { fmtGenerated } from '$lib/utils/dates';

const logger = getLogger('generateBuildingReport');

// ── Truncated display ID (max 8 chars for narrow column) ─────────────────────
function displayId(element, floorLevel) {
  return trunc(elementDisplayId(element, floorLevel), 8);
}

// ── Door column definitions ───────────────────────────────────────────────────
// 6 columns: ID | Label | Subtype | Security | Status | Notes
// Widths sum to CONTENT_W = 10466 DXA
const DOOR_COLS = [
  { label: 'ID',       width: 1200 },
  { label: 'Label',    width: 1200 },
  { label: 'Subtype',  width: 2000 },
  { label: 'Security', width: 1400 },
  { label: 'Status',   width: 1200 },
  { label: 'Notes',    width: 3466 },
];

function doorCells(element, floorLevel, alt) {
  const failed = element.status === 'failed';
  return [
    dCell(displayId(element, floorLevel),    DOOR_COLS[0].width, { alt }),
    dCell(trunc(element.label, 8),           DOOR_COLS[1].width, { alt }),
    dCell(trunc(element.subtype, 14),        DOOR_COLS[2].width, { alt }),
    dCell(trunc(element.security, 12),       DOOR_COLS[3].width, { alt }),
    dCell(statusLabel(element.status),       DOOR_COLS[4].width, { alt, color: failed ? COLOURS.failRed : undefined, bold: failed }),
    dCell(trunc(element.notes, 20),          DOOR_COLS[5].width, { alt }),
  ];
}

// ── Light column definitions ──────────────────────────────────────────────────
// 9 columns: ID | Label | Subtype | Battery | Emergency | Watts | Motion | Status | Notes
// Widths sum to CONTENT_W = 10466 DXA
const LIGHT_COLS = [
  { label: 'ID',        width:  900 },
  { label: 'Label',     width:  900 },
  { label: 'Subtype',   width: 1600 },
  { label: 'Battery',   width: 1000 },
  { label: 'Emergency', width: 1400 },
  { label: 'Watts',     width:  750 },
  { label: 'Motion',    width:  850 },
  { label: 'Status',    width: 1000 },
  { label: 'Notes',     width: 2066 },
];

function lightCells(element, floorLevel, alt) {
  const failed = element.status === 'failed';
  return [
    dCell(displayId(element, floorLevel),                  LIGHT_COLS[0].width, { alt }),
    dCell(trunc(element.label, 8),                         LIGHT_COLS[1].width, { alt }),
    dCell(trunc(element.subtype, 14),                      LIGHT_COLS[2].width, { alt }),
    dCell(trunc(element.battery, 8),                       LIGHT_COLS[3].width, { alt }),
    dCell(element.emergency ? 'Yes' : 'No',                LIGHT_COLS[4].width, { alt }),
    dCell(element.wattage ? `${element.wattage}W` : '—',   LIGHT_COLS[5].width, { alt, align: AlignmentType.RIGHT }),
    dCell(element.movement_sensor ? 'Yes' : 'No',          LIGHT_COLS[6].width, { alt }),
    dCell(statusLabel(element.status),                     LIGHT_COLS[7].width, { alt, color: failed ? COLOURS.failRed : undefined, bold: failed }),
    dCell(trunc(element.notes, 20),                        LIGHT_COLS[8].width, { alt }),
  ];
}

// ── Table builder for one floor ───────────────────────────────────────────────
function buildFloorTable(elements, floorLevel, elementType) {
  const cols    = elementType === 'light' ? LIGHT_COLS : DOOR_COLS;
  const cellsFn = elementType === 'light' ? lightCells : doorCells;

  const headerRow = new TableRow({
    tableHeader: true,
    children:    cols.map(c => hCell(c.label, c.width)),
  });

  const dataRows = elements.map((el, i) =>
    new TableRow({ children: cellsFn(el, floorLevel, i % 2 === 1) })
  );

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: cols.map(c => c.width),
    rows:         [headerRow, ...dataRows],
  });
}

// ── Paragraph helpers ─────────────────────────────────────────────────────────
function typeLabel(t) {
  return { communal_door: 'Communal Doors', apartment_door: 'Apartment Doors', light: 'Lighting' }[t] ?? t;
}

function h1(text) {
  return new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 200 },
    children: [new TextRun({ text, font: 'Arial', size: 36, bold: true, color: COLOURS.textDark })],
  });
}

function h2(text) {
  return new Paragraph({
    heading:  HeadingLevel.HEADING_2,
    spacing:  { before: 400, after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 26, bold: true, color: COLOURS.subheading })],
  });
}

// Renders a line with mixed bold/normal/coloured text runs
function statLine(runs, spacingAfter = 160) {
  return new Paragraph({
    spacing:  { after: spacingAfter },
    children: runs.map(r => new TextRun({ font: 'Arial', size: 20, ...r })),
  });
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST({ request }) {
  logger('📄 POST /api/plans/generate-building-report');

  try {
    const { building, plans, elementsByPlan, options } = await request.json();

    if (!building || !plans || !elementsByPlan || !options) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { elementType, filterLabel } = options;
    const generatedAt = fmtGenerated();

    logger('Building:', building, '| Type:', elementType, '| Plans:', plans.length);

    // Sort plans by canonical floor order
    const sortedPlans = [...plans].sort((a, b) =>
      floorSortKey(a.floor_level) - floorSortKey(b.floor_level)
    );

    // Grand totals across all floors
    let allElements = [];
    for (const plan of sortedPlans) {
      allElements = allElements.concat(elementsByPlan[plan.id] ?? []);
    }
    const grandTotal  = allElements.length;
    const failedTotal = allElements.filter(e => e.status === 'failed').length;

    // ── Build document children ───────────────────────────────────────────────
    const children = [];

    children.push(h1(`${building} — ${typeLabel(elementType)} Report`));

    if (filterLabel && filterLabel !== 'All') {
      children.push(statLine([{ text: 'Filter: ', bold: true }, { text: filterLabel }]));
    }

    const summaryRuns = [{ text: 'Total: ', bold: true }, { text: String(grandTotal) }];
    if (failedTotal > 0) {
      summaryRuns.push({ text: '    Failed: ', bold: true });
      summaryRuns.push({ text: String(failedTotal), color: COLOURS.failRed, bold: true });
    }
    children.push(statLine(summaryRuns));

    if (grandTotal > 0) {
      children.push(statLine([{ text: 'Subtypes: ', bold: true }, { text: subtypeSummary(allElements) }], 300));
    } else {
      children.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
    }

    // One section per floor
    let firstFloor = true;
    for (const plan of sortedPlans) {
      const els = elementsByPlan[plan.id] ?? [];
      if (els.length === 0) continue;

      if (!firstFloor) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
      firstFloor = false;

      children.push(h2(floorDisplayLabel(plan.floor_level)));

      const floorFailed = els.filter(e => e.status === 'failed').length;
      const floorRuns   = [{ text: `${els.length} element${els.length !== 1 ? 's' : ''}` }];
      if (floorFailed > 0) {
        floorRuns.push({ text: '    Failed: ', bold: true });
        floorRuns.push({ text: String(floorFailed), color: COLOURS.failRed, bold: true });
      }
      children.push(statLine(floorRuns));
      children.push(statLine([{ text: subtypeSummary(els), color: '555555' }], 160));

      children.push(buildFloorTable(els, plan.floor_level, elementType));
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    }

    if (grandTotal === 0) {
      children.push(statLine([{ text: 'No elements matched the selected filters.' }]));
    }

    // ── Assemble document ─────────────────────────────────────────────────────
    const doc = new Document({
      styles:   DOC_STYLES,
      sections: [{
        properties: pageProps(),
        headers:    { default: makeHeader(`${building} — ${typeLabel(elementType)} Report`, generatedAt) },
        footers:    { default: makeFooter() },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    logger('✅ Building report generated, size:', buffer.byteLength);

    const safeBuilding = building.replace(/[^a-z0-9]/gi, '_');
    const typeSlug     = elementType.replace('_', '-');
    const filename     = `${safeBuilding}_${typeSlug}_report.docx`;

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
