// src/routes/api/v2/generate-report/+server.js
// Generate a Word document report for V2 components.
//
// Accepts: { options, floors }
//   options: { reportTypes, building, filterSummary, generatedAt }
//   floors:  [{ floor, components, imageBase64, imageWidth, imageHeight }]
//
// reportTypes: array of one or more:
//   'plan'          — plan graphic per floor
//   'full_list'     — full component table per floor
//   'floor_summary' — type/status count table per floor
//   'full_summary'  — aggregate summary across all floors (appended at end)
//
// Each floor's content is grouped together. Page break between floors.
// Full summary (if requested) follows on a new page after all floors.

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  ImageRun, PageBreak,
  WidthType, HeadingLevel, ShadingType,
  AlignmentType, VerticalAlign, TableLayoutType
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  CONTENT_W, COLOURS, BORDERS, CELL_PAD,
  hCell, dCell, run, para,
  makeHeader, makeFooter,
  DOC_STYLES, pageProps
} from '$lib/server/docxHelpers.js';

const logger = getLogger('v2GenerateReport');

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_LABEL = { ok: 'OK', problem: 'Problem', failed: 'Failed', inactive: 'Inactive' };
const STATUS_COLOUR = {
  ok:       COLOURS.passGreen,
  problem:  COLOURS.warnAmber,
  failed:   COLOURS.failRed,
  inactive: '6B7280',
};

function statusCell(status, widthDxa, alt) {
  const colour = STATUS_COLOUR[status] ?? COLOURS.textDark;
  const label  = STATUS_LABEL[status]  ?? (status ?? '—');
  return new TableCell({
    width:         { size: widthDxa, type: WidthType.DXA },
    margins:       CELL_PAD,
    borders:       BORDERS,
    shading:       { fill: alt ? COLOURS.altRowFill : 'FFFFFF', type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      spacing:  { before: 0, after: 0 },
      children: [run(label, { size: 18, bold: true, color: colour })],
    })],
  });
}

function numCell(value, widthDxa, positiveColour) {
  return new TableCell({
    width:         { size: widthDxa, type: WidthType.DXA },
    margins:       CELL_PAD,
    borders:       BORDERS,
    shading:       { fill: 'FFFFFF', type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 0, after: 0 },
      children:  [run(String(value ?? 0), {
        size:  18,
        bold:  value > 0,
        color: value > 0 ? positiveColour : COLOURS.textMuted,
      })],
    })],
  });
}

// navy-fill header numCell (used in grand-total row)
function numCellHeader(value, widthDxa) {
  return new TableCell({
    width:         { size: widthDxa, type: WidthType.DXA },
    margins:       CELL_PAD,
    borders:       BORDERS,
    shading:       { fill: COLOURS.headerFill, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 0, after: 0 },
      children:  [run(String(value ?? 0), { size: 18, bold: true, color: COLOURS.textWhite })],
    })],
  });
}

// ── Sort helper ───────────────────────────────────────────────────────────────
function sortComponents(comps) {
  return [...comps].sort((a, b) =>
    (a.system_name ?? '').localeCompare(b.system_name ?? '') ||
    (a.type_name   ?? '').localeCompare(b.type_name   ?? '') ||
    (a.asset_id    ?? '').localeCompare(b.asset_id    ?? '', undefined, { numeric: true, sensitivity: 'base' })
  );
}

// ── Full component table (per floor) ─────────────────────────────────────────
// Columns: System | Type | Asset ID | Label | Attributes | Notes | Status
// DXA:     1400  | 1600 |   68     | 1957  |    2200    | 2791  |  450  = 10466
// Asset ID = 30% of previous 225 (→ 68); freed 157 added to Label (1800 → 1957)
const FL_COLS = [1400, 1600, 560, 1957, 2200, 1759, 990];

function buildComponentTable(components) {
  const sorted = sortComponents(components);

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('System',     FL_COLS[0]),
      hCell('Type',       FL_COLS[1]),
      hCell('Id',         FL_COLS[2]),
      hCell('Label',      FL_COLS[3]),
      hCell('Attributes', FL_COLS[4]),
      hCell('Notes',      FL_COLS[5]),
      hCell('Status',     FL_COLS[6]),
    ],
  });

  const dataRows = sorted.map((c, idx) => {
    const alt   = idx % 2 === 1;
    const attrs = (c.attributes ?? []).map(a => `${a.name}: ${a.value}`).join('  ·  ');
    return new TableRow({
      children: [
        dCell(c.system_name ?? '—', FL_COLS[0], { alt }),
        dCell(c.type_name   ?? '—', FL_COLS[1], { alt }),
        dCell(c.asset_id    ?? '—', FL_COLS[2], { alt }),
        dCell(c.label       ?? '—', FL_COLS[3], { alt }),
        dCell(attrs || '—',         FL_COLS[4], { alt }),
        dCell('',                   FL_COLS[5], { alt }),
        statusCell(c.status, FL_COLS[6], alt),
      ],
    });
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: FL_COLS,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows],
  });
}

// ── Per-floor summary pivot table ─────────────────────────────────────────────
// Columns: System | Type | OK | Problem | Failed | Inactive | Total  (matches Full Summary)
// DXA:     2000  | 2200 | 1050 | 1200  |  1050  |   1200  | 1766  = 10466
const FS_COLS = [2000, 2200, 1050, 1200, 1050, 1200, 1766];

function buildFloorSummaryTable(components) {
  const pivotMap = {};
  for (const c of components) {
    const key = `${c.system_name ?? ''}|${c.type_name ?? c.type_code ?? ''}`;
    if (!pivotMap[key]) {
      pivotMap[key] = {
        system_name: c.system_name ?? 'Other',
        type_name:   c.type_name ?? c.type_code ?? '?',
        ok: 0, problem: 0, failed: 0, inactive: 0,
      };
    }
    const s = (c.status ?? '').toLowerCase();
    if (s in pivotMap[key]) pivotMap[key][s]++;
  }

  const pivot = Object.values(pivotMap).sort((a, b) =>
    a.system_name.localeCompare(b.system_name) ||
    a.type_name.localeCompare(b.type_name)
  );

  if (pivot.length === 0) return null;

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('System',   FS_COLS[0]),
      hCell('Type',     FS_COLS[1]),
      hCell('OK',       FS_COLS[2], { fill: '1a4a2a' }),
      hCell('Problem',  FS_COLS[3], { fill: '5c3a0a' }),
      hCell('Failed',   FS_COLS[4], { fill: '5c1a1a' }),
      hCell('Inactive', FS_COLS[5], { fill: '374151' }),
      hCell('Total',    FS_COLS[6]),
    ],
  });

  const dataRows = pivot.map(row => {
    const total = row.ok + row.problem + row.failed + row.inactive;
    return new TableRow({
      children: [
        dCell(row.system_name, FS_COLS[0]),
        dCell(row.type_name,   FS_COLS[1]),
        numCell(row.ok,        FS_COLS[2], COLOURS.passGreen),
        numCell(row.problem,   FS_COLS[3], COLOURS.warnAmber),
        numCell(row.failed,    FS_COLS[4], COLOURS.failRed),
        numCell(row.inactive,  FS_COLS[5], '9CA3AF'),
        dCell(String(total),   FS_COLS[6], { bold: true }),
      ],
    });
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: FS_COLS,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows],
  });
}

// ── Full summary pivot table (System | Type | OK | Problem | Failed | Inactive | Total) ──
// DXA: 2000 | 2200 | 1050 | 1200 | 1050 | 1200 | 1766 = 10466
const SM_COLS = [2000, 2200, 1050, 1200, 1050, 1200, 1766];

function buildFullSummarySection(allFloors, building, filterSummary) {
  const children = [];

  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 200 },
    children: [run(`${building} — Full Summary`, { size: 36, bold: true, color: COLOURS.textDark })],
  }));

  if (filterSummary && filterSummary !== 'All components') {
    children.push(para([
      run('Filters: ', { bold: true, size: 18 }),
      run(filterSummary, { italics: true, size: 18, color: COLOURS.textMuted }),
    ], { after: 200 }));
  }

  // Aggregate all components across all floors
  const allComponents = allFloors.flatMap(f => f.components ?? []);

  if (allComponents.length === 0) {
    children.push(para('No components match the current filters.', { after: 160 }));
    return children;
  }

  // Pivot by system + type
  const pivotMap = {};
  for (const c of allComponents) {
    const key = `${c.system_name ?? ''}|${c.type_name ?? c.type_code ?? ''}`;
    if (!pivotMap[key]) {
      pivotMap[key] = {
        system_name: c.system_name ?? 'Other',
        type_name:   c.type_name ?? c.type_code ?? '?',
        ok: 0, problem: 0, failed: 0, inactive: 0,
      };
    }
    const s = (c.status ?? '').toLowerCase();
    if (s in pivotMap[key]) pivotMap[key][s]++;
  }

  const pivot = Object.values(pivotMap).sort((a, b) =>
    a.system_name.localeCompare(b.system_name) ||
    a.type_name.localeCompare(b.type_name)
  );

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('System',   SM_COLS[0]),
      hCell('Type',     SM_COLS[1]),
      hCell('OK',       SM_COLS[2], { fill: '1a4a2a' }),
      hCell('Problem',  SM_COLS[3], { fill: '5c3a0a' }),
      hCell('Failed',   SM_COLS[4], { fill: '5c1a1a' }),
      hCell('Inactive', SM_COLS[5], { fill: '374151' }),
      hCell('Total',    SM_COLS[6]),
    ],
  });

  const dataRows = pivot.map(row => {
    const total = row.ok + row.problem + row.failed + row.inactive;
    return new TableRow({
      children: [
        dCell(row.system_name, SM_COLS[0]),
        dCell(row.type_name,   SM_COLS[1]),
        numCell(row.ok,       SM_COLS[2], COLOURS.passGreen),
        numCell(row.problem,  SM_COLS[3], COLOURS.warnAmber),
        numCell(row.failed,   SM_COLS[4], COLOURS.failRed),
        numCell(row.inactive, SM_COLS[5], '9CA3AF'),
        dCell(String(total),  SM_COLS[6], { bold: true }),
      ],
    });
  });

  // Grand total footer row
  const grandOk       = pivot.reduce((s, r) => s + r.ok,       0);
  const grandProblem  = pivot.reduce((s, r) => s + r.problem,   0);
  const grandFailed   = pivot.reduce((s, r) => s + r.failed,    0);
  const grandInactive = pivot.reduce((s, r) => s + r.inactive,  0);
  const grandTotal    = grandOk + grandProblem + grandFailed + grandInactive;

  const totalRow = new TableRow({
    children: [
      hCell('TOTAL', SM_COLS[0] + SM_COLS[1], { fill: COLOURS.headerFill }),
      numCellHeader(grandOk,       SM_COLS[2]),
      numCellHeader(grandProblem,  SM_COLS[3]),
      numCellHeader(grandFailed,   SM_COLS[4]),
      numCellHeader(grandInactive, SM_COLS[5]),
      numCellHeader(grandTotal,    SM_COLS[6]),
    ],
  });

  children.push(new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: SM_COLS,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows, totalRow],
  }));

  return children;
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST({ request }) {
  logger('📄 POST /api/v2/generate-report');

  try {
    const body = await request.json();
    const { options = {}, floors = [] } = body;

    const {
      reportTypes  = [],
      building     = 'Lancaster House',
      filterSummary = '',
      generatedAt  = '',
    } = options;

    if (!reportTypes.length) {
      return json({ error: 'No report sections requested.' }, { status: 400 });
    }
    if (!floors.length) {
      return json({ error: 'No floor data supplied.' }, { status: 400 });
    }

    const wantPlan         = reportTypes.includes('plan');
    const wantList         = reportTypes.includes('full_list');
    const wantFloorSummary = reportTypes.includes('floor_summary');
    const wantFullSummary  = reportTypes.includes('full_summary');

    logger('Report types:', reportTypes.join(', '), '| Floors:', floors.length, '| Building:', building);

    const docTitle = `${building} — Component Report`;
    const genAt    = generatedAt || new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    // ── Assemble document ─────────────────────────────────────────────────────
    const children = [];

    // Document title + filter summary
    children.push(new Paragraph({
      heading:  HeadingLevel.HEADING_1,
      spacing:  { before: 0, after: 200 },
      children: [run(docTitle, { size: 36, bold: true, color: COLOURS.textDark })],
    }));

    if (filterSummary && filterSummary !== 'All components') {
      children.push(para([
        run('Filters: ', { bold: true, size: 18 }),
        run(filterSummary, { italics: true, size: 18, color: COLOURS.textMuted }),
      ], { after: 240 }));
    }

    // ── Per-floor content ─────────────────────────────────────────────────────
    for (let fi = 0; fi < floors.length; fi++) {
      const { floor, components = [], imageBase64, imageWidth, imageHeight } = floors[fi];

      // Page break between floors (not before the first floor)
      if (fi > 0) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }

      // Floor heading
      children.push(new Paragraph({
        heading:  HeadingLevel.HEADING_2,
        spacing:  { before: 0, after: 160 },
        children: [run(
          `${floor.short_name} — ${floor.name}  (${components.length})`,
          { size: 26, bold: true, color: COLOURS.subheading }
        )],
      }));

      // ── Plan graphic ──────────────────────────────────────────────────────
      if (wantPlan) {
        if (imageBase64 && imageWidth && imageHeight) {
          const maxPts = 520;
          const scale  = Math.min(1, maxPts / imageWidth);
          const dW     = Math.round(imageWidth  * scale);
          const dH     = Math.round(imageHeight * scale);

          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing:   { before: 80, after: 240 },
            children:  [
              new ImageRun({
                data:           Buffer.from(imageBase64, 'base64'),
                type:           'png',
                transformation: { width: dW, height: dH },
              }),
            ],
          }));
        } else {
          children.push(para(
            'No plan image available for this floor.',
            { italics: true, size: 16, color: COLOURS.textMuted, after: 200 }
          ));
        }
      }

      if (components.length === 0) {
        children.push(para('No components on this floor.', { after: 160, size: 18 }));
        continue;
      }

      // ── Full component table ──────────────────────────────────────────────
      if (wantList) {
        children.push(buildComponentTable(components));
        children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
      }

      // ── Floor summary table ───────────────────────────────────────────────
      if (wantFloorSummary) {
        children.push(para('Floor Summary', { bold: true, size: 20, before: 120, after: 100 }));
        const fsTable = buildFloorSummaryTable(components);
        if (fsTable) {
          children.push(fsTable);
          children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
        }
      }
    }

    // ── Full summary section (all floors combined) ────────────────────────────
    if (wantFullSummary) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(...buildFullSummarySection(floors, building, filterSummary));
    }

    // ── Build document ────────────────────────────────────────────────────────
    const doc = new Document({
      styles:   DOC_STYLES,
      sections: [{
        properties: pageProps(),
        headers:    { default: makeHeader(docTitle, genAt) },
        footers:    { default: makeFooter() },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    logger('✅ V2 report generated, size:', buffer.byteLength, 'bytes');

    const safeBuilding = building.replace(/[^a-z0-9]/gi, '_');
    const dateSlug     = new Date().toISOString().slice(0, 10);
    const filename     = `${safeBuilding}_Components_${dateSlug}.docx`;

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
