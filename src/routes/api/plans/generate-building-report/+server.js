// src/routes/api/plans/generate-building-report/+server.js
// Generates a Word document building report spanning all floors.
// Sorted by floor (using the canonical dropdown order) then by asset ID.
// Columns are tailored to the element type chosen.

import { json }          from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  Header, Footer,
  PageNumber, PageBreak, PageOrientation,
  WidthType, AlignmentType, HeadingLevel,
  BorderStyle, ShadingType,
  VerticalAlign
} from 'docx';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('generateBuildingReport');

// ── Floor level canonical order (mirrors the dropdown) ─────────────────────
const FLOOR_ORDER = { L: 0, U: 1, G: 2, '1': 3, '2': 4, '3': 5, '4': 6, '5': 7, '6': 8, '7': 9 };
function floorSortKey(floorLevel) {
  return FLOOR_ORDER[String(floorLevel)] ?? 99;
}

function floorDisplayLabel(floorLevel) {
  const map = { L: 'Lower', U: 'Upper', G: 'Ground', '1': 'First', '2': 'Second',
    '3': 'Third', '4': 'Fourth', '5': 'Fifth', '6': 'Sixth', '7': 'Seventh' };
  const v = String(floorLevel);
  return map[v] ? `Floor ${v} — ${map[v]}` : `Floor ${v}`;
}

// ── Display name ────────────────────────────────────────────────────────────
function displayName(element, floorLevel) {
  const floor = floorLevel !== null && floorLevel !== undefined ? String(floorLevel) : '?';
  return `${floor} / ${element.asset_id || 'No ID'}`;
}

// ── Status label ────────────────────────────────────────────────────────────
function statusLabel(s) {
  return { active: 'Active', failed: 'Failed', inactive: 'Inactive',
           maintenance: 'Maintenance', removed: 'Removed' }[s] ?? s ?? '—';
}

// ── Boolean → Yes/No ────────────────────────────────────────────────────────
function yn(v) { return v ? 'Yes' : 'No'; }

// ── Shared border / style helpers ───────────────────────────────────────────
const BORDER_COLOUR  = 'C8D0DC';
const HEADER_FILL    = '2C3E6B';  // dark navy for header rows
const ALT_FILL       = 'F2F5FA';  // very light blue for alternating rows
const TEXT_DARK      = '1A1A2E';
const TEXT_WHITE     = 'FFFFFF';

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOUR };
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

const CELL_PAD   = { top: 80, bottom: 80, left: 120, right: 120 };

// Page dimensions — A4 landscape (pass portrait dims, set LANDSCAPE orientation)
// A4: 11906 × 16838 DXA. Landscape content width = 16838 − 2×1080 = 14678
const PAGE_W     = 11906;
const PAGE_H     = 16838;
const MARGIN     = 720;   // 0.5 inch all sides
const CONTENT_W  = PAGE_H - 2 * MARGIN;  // 15398 DXA (landscape uses long edge)

function hCell(text, width, { align = AlignmentType.LEFT } = {}) {
  return new TableCell({
    borders:  allBorders,
    width:    { size: width, type: WidthType.DXA },
    margins:  CELL_PAD,
    shading:  { fill: HEADER_FILL, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      children:  [new TextRun({ text, bold: true, color: TEXT_WHITE, size: 18, font: 'Arial' })]
    })]
  });
}

function dCell(text, width, { align = AlignmentType.LEFT, shade = false, bold = false, color } = {}) {
  return new TableCell({
    borders:  allBorders,
    width:    { size: width, type: WidthType.DXA },
    margins:  CELL_PAD,
    shading:  shade ? { fill: ALT_FILL, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      children:  [new TextRun({
        text:  text ?? '—',
        size:  18,
        font:  'Arial',
        bold:  bold || false,
        color: color ?? TEXT_DARK
      })]
    })]
  });
}

// ── Column definitions per element type ─────────────────────────────────────
//
// Door columns:  ID | Label | Subtype | Security | Retained | Status | Notes
// Light columns: ID | Label | Subtype | Battery  | Wattage  | Emergency | Motion | LightSnsr | Status | Notes
//
// All widths must sum to CONTENT_W (15398)

function doorColumns() {
  // 7 columns
  return [
    { label: 'ID',       width: 1800 },
    { label: 'Label',    width: 2600 },
    { label: 'Subtype',  width: 2000 },
    { label: 'Security', width: 1800 },
    { label: 'Retained', width: 1400 },
    { label: 'Status',   width: 1600 },
    { label: 'Notes',    width: 4198 },  // remainder
  ];
}

function lightColumns() {
  // 10 columns
  return [
    { label: 'ID',         width: 1600 },
    { label: 'Label',      width: 2200 },
    { label: 'Subtype',    width: 1800 },
    { label: 'Battery',    width: 1600 },
    { label: 'Wattage',    width: 1100 },
    { label: 'Emergency',  width: 1300 },
    { label: 'Motion',     width: 1100 },
    { label: 'LightSnsr',  width: 1200 },
    { label: 'Status',     width: 1400 },
    { label: 'Notes',      width: 2098 },  // remainder
  ];
}

function getColumns(elementType) {
  return elementType === 'light' ? lightColumns() : doorColumns();
}

function elementCells(element, floorLevel, elementType, shade) {
  const name = displayName(element, floorLevel);
  const s    = shade;

  if (elementType === 'light') {
    const cols = lightColumns();
    return [
      dCell(name,                                    cols[0].width, { shade: s }),
      dCell(element.label || '—',                    cols[1].width, { shade: s }),
      dCell(element.subtype || '—',                  cols[2].width, { shade: s }),
      dCell(element.battery || '—',                  cols[3].width, { shade: s }),
      dCell(element.wattage ? `${element.wattage}W` : '—', cols[4].width, { shade: s, align: AlignmentType.RIGHT }),
      dCell(yn(element.emergency),                   cols[5].width, { shade: s,
        color: element.emergency ? '8B0000' : TEXT_DARK,
        bold:  element.emergency }),
      dCell(yn(element.movement_sensor),             cols[6].width, { shade: s }),
      dCell(yn(element.light_sensor),                cols[7].width, { shade: s }),
      dCell(statusLabel(element.status),             cols[8].width, { shade: s,
        color: element.status === 'failed' ? 'C0392B' : TEXT_DARK,
        bold:  element.status === 'failed' }),
      dCell(element.notes || '—',                    cols[9].width, { shade: s }),
    ];
  } else {
    const cols = doorColumns();
    return [
      dCell(name,                                    cols[0].width, { shade: s }),
      dCell(element.label || '—',                    cols[1].width, { shade: s }),
      dCell(element.subtype || '—',                  cols[2].width, { shade: s }),
      dCell(element.security || '—',                 cols[3].width, { shade: s }),
      dCell(yn(element.retained),                    cols[4].width, { shade: s }),
      dCell(statusLabel(element.status),             cols[5].width, { shade: s,
        color: element.status === 'failed' ? 'C0392B' : TEXT_DARK,
        bold:  element.status === 'failed' }),
      dCell(element.notes || '—',                    cols[6].width, { shade: s }),
    ];
  }
}

// ── Table builder for one floor ─────────────────────────────────────────────
function buildFloorTable(elements, floorLevel, elementType) {
  const cols = getColumns(elementType);

  // Header row
  const headerRow = new TableRow({
    tableHeader: true,
    children:    cols.map(c => hCell(c.label, c.width))
  });

  // Data rows — alternating shade on odd rows
  const dataRows = elements.map((el, i) =>
    new TableRow({
      children: elementCells(el, floorLevel, elementType, i % 2 === 1)
    })
  );

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: cols.map(c => c.width),
    rows:         [headerRow, ...dataRows]
  });
}

// ── Type label ──────────────────────────────────────────────────────────────
function typeLabel(t) {
  return { communal_door: 'Communal Doors', apartment_door: 'Apartment Doors',
           light: 'Lighting' }[t] ?? t;
}

// ── Heading paragraph helpers ───────────────────────────────────────────────
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text, font: 'Arial', size: 36, bold: true, color: TEXT_DARK })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, font: 'Arial', size: 26, bold: true, color: '2C3E6B' })]
  });
}

function bodyPara(text, { spacing = { after: 120 } } = {}) {
  return new Paragraph({
    spacing,
    children: [new TextRun({ text, font: 'Arial', size: 20, color: TEXT_DARK })]
  });
}

function metaRow(label, value) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: `${label}: `, font: 'Arial', size: 20, bold: true, color: TEXT_DARK }),
      new TextRun({ text: value, font: 'Arial', size: 20, color: TEXT_DARK })
    ]
  });
}

// ── POST handler ─────────────────────────────────────────────────────────────
export async function POST({ request }) {
  logger('📄 POST /api/plans/generate-building-report — request received');

  try {
    const { building, plans, elementsByPlan, options } = await request.json();

    if (!building || !plans || !elementsByPlan || !options) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { elementType, filterLabel } = options;
    const generatedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    logger('Building:', building, '| Type:', elementType, '| Plans:', plans.length);

    // Sort plans by the canonical floor order
    const sortedPlans = [...plans].sort((a, b) =>
      floorSortKey(a.floor_level) - floorSortKey(b.floor_level)
    );

    // ── Document content ──────────────────────────────────────────────────────
    const children = [];

    // Cover / header block
    children.push(h1(`${building} — ${typeLabel(elementType)} Report`));
    children.push(metaRow('Building',   building));
    children.push(metaRow('Type',       typeLabel(elementType)));
    children.push(metaRow('Filter',     filterLabel || 'All'));
    children.push(metaRow('Generated',  generatedAt));

    // Tally across all floors
    let grandTotal = 0;
    let failedTotal = 0;
    for (const plan of sortedPlans) {
      const els = elementsByPlan[plan.id] ?? [];
      grandTotal  += els.length;
      failedTotal += els.filter(e => e.status === 'failed').length;
    }
    children.push(metaRow('Total elements', String(grandTotal)));
    if (failedTotal > 0) {
      children.push(new Paragraph({
        spacing: { after: 300 },
        children: [
          new TextRun({ text: 'Failed: ', font: 'Arial', size: 20, bold: true }),
          new TextRun({ text: String(failedTotal), font: 'Arial', size: 20, color: 'C0392B', bold: true })
        ]
      }));
    } else {
      children.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
    }

    // ── One section per floor ─────────────────────────────────────────────────
    let firstFloor = true;
    for (const plan of sortedPlans) {
      const els = elementsByPlan[plan.id] ?? [];
      if (els.length === 0) continue;  // skip floors with no matching elements

      if (!firstFloor) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
      firstFloor = false;

      children.push(h2(floorDisplayLabel(plan.floor_level)));
      children.push(bodyPara(
        `${els.length} element${els.length !== 1 ? 's' : ''}` +
        (failedTotal > 0 ? ` — ${els.filter(e => e.status === 'failed').length} failed` : ''),
        { spacing: { after: 160 } }
      ));

      children.push(buildFloorTable(els, plan.floor_level, elementType));
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    }

    if (grandTotal === 0) {
      children.push(bodyPara('No elements matched the selected filters.'));
    }

    // ── Build document ────────────────────────────────────────────────────────
    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: 'Arial', size: 20 } }
        },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 36, bold: true, font: 'Arial', color: TEXT_DARK },
            paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 26, bold: true, font: 'Arial', color: '2C3E6B' },
            paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 1 } }
        ]
      },
      sections: [{
        properties: {
          page: {
            size: {
              width:       PAGE_W,
              height:      PAGE_H,
              orientation: PageOrientation.LANDSCAPE
            },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
          }
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [
                new TextRun({ text: `${building} — ${typeLabel(elementType)} Report`, font: 'Arial', size: 18, color: '555555' }),
                new TextRun({ text: '\t', font: 'Arial' }),
                new TextRun({ text: generatedAt, font: 'Arial', size: 18, color: '888888' })
              ],
              tabStops: [{ type: 'right', position: CONTENT_W }],
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOUR, space: 4 } }
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
    logger('✅ Building report generated, size:', buffer.byteLength);

    const safeBuilding  = building.replace(/[^a-z0-9]/gi, '_');
    const typeSlug      = elementType.replace('_', '-');
    const filename      = `${safeBuilding}_${typeSlug}_report.docx`;

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
