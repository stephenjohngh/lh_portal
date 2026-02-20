// src/routes/api/plans/generate-building-report/+server.js
// Generates a Word document building report spanning all floors.
// Sorted by floor (using the canonical dropdown order) then by asset ID.
// Doors only — lights are not reported in table form.

import { json }          from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  Header, Footer,
  PageNumber, PageBreak,
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

// ── Type initials — matches planConstants.js TYPE_INITIALS ─────────────────
const TYPE_INITIALS = {
  communal_door:  'D',
  apartment_door: 'A',
  light:          'L',
  fire_control:   'F'
};

// ── Display name: FloorCode/TypeInitial/AssetID e.g. "G/D/001" ───────────
function displayId(element, floorLevel) {
  const floor = floorLevel !== null && floorLevel !== undefined ? String(floorLevel) : '?';
  const type  = TYPE_INITIALS[element.element_type] ?? '?';
  const id    = element.asset_id || 'No ID';
  return trunc(`${floor}/${type}/${id}`, 8);
}

// ── Truncate to max chars ─────────────────────────────────────────────────
function trunc(val, maxLen) {
  if (!val) return '—';
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

// ── Status label (truncated to 8) ────────────────────────────────────────
function statusLabel(s) {
  const labels = { active: 'OK', failed: 'Failed', inactive: 'Inactv',
                   maintenance: 'Maint', removed: 'Removd' };
  return labels[s] ?? trunc(s, 8) ?? '—';
}

// ── Shared border / style helpers ──────────────────────────────────────────
const BORDER_COLOUR = 'C8D0DC';
const HEADER_FILL   = '2C3E6B';   // dark navy for header rows
const ALT_FILL      = 'F2F5FA';   // very light blue for alternating rows
const TEXT_DARK     = '1A1A2E';
const TEXT_WHITE    = 'FFFFFF';

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOUR };
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
const CELL_PAD   = { top: 80, bottom: 80, left: 120, right: 120 };

// Page dimensions — A4 portrait
// A4: 11906 × 16838 DXA. Portrait content width = 11906 − 2×720 = 10466
const PAGE_W    = 11906;
const PAGE_H    = 16838;
const MARGIN    = 720;               // 0.5 inch all sides
const CONTENT_W = PAGE_W - 2 * MARGIN;  // 10466

function hCell(text, width) {
  return new TableCell({
    borders: allBorders,
    width:   { size: width, type: WidthType.DXA },
    margins: CELL_PAD,
    shading: { fill: HEADER_FILL, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: TEXT_WHITE, size: 18, font: 'Arial' })]
    })]
  });
}

function dCell(text, width, { shade = false, bold = false, color, align = AlignmentType.LEFT } = {}) {
  return new TableCell({
    borders: allBorders,
    width:   { size: width, type: WidthType.DXA },
    margins: CELL_PAD,
    shading: shade ? { fill: ALT_FILL, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({
        text:  text ?? '—',
        size:  18,
        font:  'Arial',
        bold:  bold || false,
        color: color ?? TEXT_DARK
      })]
    })]
  });
}

// ── Door column definitions ───────────────────────────────────────────────
// 6 columns, no Retained. Widths sum to CONTENT_W = 10466 (portrait).
// ID(8ch) | Label(8ch) | Subtype(14ch) | Security(8ch) | Status(8ch) | Notes(20ch)
const DOOR_COLS = [
  { label: 'ID',       width: 1200 },
  { label: 'Label',    width: 1200 },
  { label: 'Subtype',  width: 2000 },
  { label: 'Security', width: 1400 },
  { label: 'Status',   width: 1200 },
  { label: 'Notes',    width: 3466 },  // remainder: 10466 - 7000 = 3466
];

function doorCells(element, floorLevel, shade) {
  const s = shade;
  return [
    dCell(displayId(element, floorLevel),        DOOR_COLS[0].width, { shade: s }),
    dCell(trunc(element.label, 8),               DOOR_COLS[1].width, { shade: s }),
    dCell(trunc(element.subtype, 14),            DOOR_COLS[2].width, { shade: s }),
    dCell(trunc(element.security, 12) || '—', DOOR_COLS[3].width, { shade: s }),
    dCell(statusLabel(element.status),           DOOR_COLS[4].width, { shade: s,
      color: element.status === 'failed' ? 'C0392B' : TEXT_DARK,
      bold:  element.status === 'failed' }),
    dCell(trunc(element.notes, 20),              DOOR_COLS[5].width, { shade: s }),
  ];
}

// ── Light column definitions ─────────────────────────────────────────────
// 9 columns, no Light Sensor. Widths sum to CONTENT_W = 10466 (portrait).
// ID(8) | Label(8) | Subtype(14) | Battery(8) | Wattage | Emergency | Motion | Status(8) | Notes(20)
const LIGHT_COLS = [
  { label: 'ID',        width:  900 },
  { label: 'Label',     width:  900 },
  { label: 'Subtype',   width: 1600 },
  { label: 'Battery',   width: 1000 },
  { label: 'Emergency', width: 1400 },
  { label: 'Watts',     width:  750 },
  { label: 'Motion',    width:  850 },
  { label: 'Status',    width: 1000 },
  { label: 'Notes',     width: 2066 },  // remainder: 10466 - 8400 = 2066
];

function lightCells(element, floorLevel, shade) {
  const s = shade;
  return [
    dCell(displayId(element, floorLevel),                   LIGHT_COLS[0].width, { shade: s }),
    dCell(trunc(element.label, 8),                          LIGHT_COLS[1].width, { shade: s }),
    dCell(trunc(element.subtype, 14),                       LIGHT_COLS[2].width, { shade: s }),
    dCell(trunc(element.battery, 8) || '—',                LIGHT_COLS[3].width, { shade: s }),
    dCell(element.emergency ? 'Yes' : 'No',                LIGHT_COLS[4].width, { shade: s }),
    dCell(element.wattage ? `${element.wattage}W` : '—',   LIGHT_COLS[5].width, { shade: s, align: AlignmentType.RIGHT }),
    dCell(element.movement_sensor ? 'Yes' : 'No',          LIGHT_COLS[6].width, { shade: s }),
    dCell(statusLabel(element.status),                      LIGHT_COLS[7].width, { shade: s,
      color: element.status === 'failed' ? 'C0392B' : TEXT_DARK,
      bold:  element.status === 'failed' }),
    dCell(trunc(element.notes, 20),                         LIGHT_COLS[8].width, { shade: s }),
  ];
}

// ── Subtype breakdown helper ──────────────────────────────────────────────
// Returns e.g. "Entrance: 4, Fire Door: 2, Gate: 1"
function subtypeSummary(elements) {
  const counts = {};
  for (const el of elements) {
    const k = el.subtype || 'Unspecified';
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([sub, n]) => `${sub}: ${n}`)
    .join('  ·  ');
}

// ── Table builder for one floor ─────────────────────────────────────────
function buildFloorTable(elements, floorLevel, elementType) {
  const cols     = elementType === 'light' ? LIGHT_COLS : DOOR_COLS;
  const cellsFn  = elementType === 'light' ? lightCells : doorCells;

  const headerRow = new TableRow({
    tableHeader: true,
    children:    cols.map(c => hCell(c.label, c.width))
  });

  const dataRows = elements.map((el, i) =>
    new TableRow({ children: cellsFn(el, floorLevel, i % 2 === 1) })
  );

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: cols.map(c => c.width),
    rows:         [headerRow, ...dataRows]
  });
}

// ── Type label ───────────────────────────────────────────────────────────
function typeLabel(t) {
  return { communal_door: 'Communal Doors', apartment_door: 'Apartment Doors',
           light: 'Lighting' }[t] ?? t;
}

// ── Paragraph helpers ────────────────────────────────────────────────────
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
    spacing: { before: 400, after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 26, bold: true, color: '2C3E6B' })]
  });
}

function statLine(runs, spacingAfter = 160) {
  // Renders a line of mixed bold/normal/coloured text runs
  return new Paragraph({
    spacing: { after: spacingAfter },
    children: runs.map(r => new TextRun({ font: 'Arial', size: 20, ...r }))
  });
}

// ── POST handler ─────────────────────────────────────────────────────────
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

    // ── Document content ────────────────────────────────────────────────────
    const children = [];

    // Title line: "Building Name — Communal Doors Report"
    children.push(h1(`${building} — ${typeLabel(elementType)} Report`));

    // Summary block: Filter, totals, subtype breakdown — no Building/Type/Generated (in header)
    if (filterLabel && filterLabel !== 'All') {
      children.push(statLine([
        { text: 'Filter: ', bold: true },
        { text: filterLabel }
      ]));
    }

    // Total & failed on one line
    const summaryRuns = [
      { text: 'Total: ', bold: true },
      { text: String(grandTotal) }
    ];
    if (failedTotal > 0) {
      summaryRuns.push({ text: '    Failed: ', bold: true });
      summaryRuns.push({ text: String(failedTotal), color: 'C0392B', bold: true });
    }
    children.push(statLine(summaryRuns));

    // Subtype breakdown
    if (grandTotal > 0) {
      children.push(statLine([
        { text: 'Subtypes: ', bold: true },
        { text: subtypeSummary(allElements) }
      ], 300));
    } else {
      children.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
    }

    // ── One section per floor ───────────────────────────────────────────────
    let firstFloor = true;
    for (const plan of sortedPlans) {
      const els = elementsByPlan[plan.id] ?? [];
      if (els.length === 0) continue;  // skip empty floors

      if (!firstFloor) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
      firstFloor = false;

      // Floor heading
      children.push(h2(floorDisplayLabel(plan.floor_level)));

      // Per-floor stats: count, failed, subtype breakdown
      const floorFailed = els.filter(e => e.status === 'failed').length;
      const floorRuns = [
        { text: `${els.length} element${els.length !== 1 ? 's' : ''}` }
      ];
      if (floorFailed > 0) {
        floorRuns.push({ text: '    Failed: ', bold: true });
        floorRuns.push({ text: String(floorFailed), color: 'C0392B', bold: true });
      }
      children.push(statLine(floorRuns));

      // Subtype breakdown for this floor
      children.push(statLine([
        { text: subtypeSummary(els), color: '555555' }
      ], 160));

      children.push(buildFloorTable(els, plan.floor_level, elementType));
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    }

    if (grandTotal === 0) {
      children.push(statLine([{ text: 'No elements matched the selected filters.' }]));
    }

    // ── Build document ──────────────────────────────────────────────────────
    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 20 } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 36, bold: true, font: 'Arial', color: TEXT_DARK },
            paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 26, bold: true, font: 'Arial', color: '2C3E6B' },
            paragraph: { spacing: { before: 400, after: 120 }, outlineLevel: 1 } }
        ]
      },
      sections: [{
        properties: {
          page: {
            size: {
              width:  PAGE_W,
              height: PAGE_H,
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

    const safeBuilding = building.replace(/[^a-z0-9]/gi, '_');
    const typeSlug     = elementType.replace('_', '-');
    const filename     = `${safeBuilding}_${typeSlug}_report.docx`;

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
