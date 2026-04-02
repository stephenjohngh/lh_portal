// src/routes/api/v2/generate-report/+server.js
// Generate a Word document report for V2 components.
//
// Accepts: { options, floors, summary }
//   options:  { reportTypes, building, filterSummary, generatedAt }
//   floors:   [{ floor, components, imageBase64, imageWidth, imageHeight }]
//   summary:  [{ system_name, type_name, status, count }]
//
// reportTypes: array of 'full_list' | 'plan' | 'summary'

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  ImageRun, PageBreak,
  WidthType, HeadingLevel, BorderStyle, ShadingType,
  AlignmentType, VerticalAlign
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  CONTENT_W, COLOURS, BORDERS, CELL_PAD,
  hCell, dCell, run, para,
  makeHeader, makeFooter,
  DOC_STYLES, pageProps
} from '$lib/server/docxHelpers.js';

const logger = getLogger('v2GenerateReport');

// ── Status display ────────────────────────────────────────────────────────────
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

// Numeric cell — right-aligned, bold count
function numCell(value, widthDxa, colour) {
  return new TableCell({
    width:         { size: widthDxa, type: WidthType.DXA },
    margins:       CELL_PAD,
    borders:       BORDERS,
    shading:       { fill: 'FFFFFF', type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 0, after: 0 },
      children:  [run(String(value ?? 0), { size: 18, bold: value > 0, color: value > 0 ? colour : COLOURS.textMuted })],
    })],
  });
}

// ── Full List section ─────────────────────────────────────────────────────────
// Columns: Asset ID | Type | System | Label | Status | Attributes
// Width split (DXA): 900 | 1600 | 1400 | 1800 | 900 | 3866 = 10466
const FL_COLS = [900, 1600, 1400, 1800, 900, 3866];

function buildFullListSection(floors, building, filterSummary) {
  const children = [];

  // Cover for this section
  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 200 },
    children: [run(`${building} — Component List`, { size: 36, bold: true, color: COLOURS.textDark })],
  }));

  if (filterSummary && filterSummary !== 'All components') {
    children.push(para([
      run('Filters: ', { bold: true, size: 18 }),
      run(filterSummary, { italics: true, size: 18, color: COLOURS.textMuted }),
    ], { after: 200 }));
  }

  for (let fi = 0; fi < floors.length; fi++) {
    const { floor, components } = floors[fi];

    if (fi > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    // Floor heading
    children.push(new Paragraph({
      heading:  HeadingLevel.HEADING_2,
      spacing:  { before: 0, after: 160 },
      children: [run(`${floor.short_name} — ${floor.name}  (${components.length})`, { size: 26, bold: true, color: COLOURS.subheading })],
    }));

    if (components.length === 0) {
      children.push(para('No components on this floor.', { after: 160, size: 18 }));
      continue;
    }

    // Table
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        hCell('Asset ID', FL_COLS[0]),
        hCell('Type',     FL_COLS[1]),
        hCell('System',   FL_COLS[2]),
        hCell('Label',    FL_COLS[3]),
        hCell('Status',   FL_COLS[4]),
        hCell('Attributes / Notes', FL_COLS[5]),
      ],
    });

    const dataRows = components.map((c, idx) => {
      const alt   = idx % 2 === 1;
      const attrs = (c.attributes ?? []).map(a => `${a.name}: ${a.value}`).join('  ·  ');
      return new TableRow({
        children: [
          dCell(c.asset_id   ?? '—', FL_COLS[0], { alt }),
          dCell(c.type_name  ?? '—', FL_COLS[1], { alt }),
          dCell(c.system_name ?? '—', FL_COLS[2], { alt }),
          dCell(c.label      ?? '—', FL_COLS[3], { alt }),
          statusCell(c.status, FL_COLS[4], alt),
          dCell(attrs || '—',        FL_COLS[5], { alt }),
        ],
      });
    });

    children.push(new Table({
      width:   { size: CONTENT_W, type: WidthType.DXA },
      borders: BORDERS,
      rows:    [headerRow, ...dataRows],
    }));

    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  return children;
}

// ── Plan Images section ───────────────────────────────────────────────────────
// Each floor: heading + annotated plan image (if available) + placed-component table
// Columns for placed-component table: Asset ID | Type | Label | Status
// Width split: 1100 | 2100 | 4766 | 2500 = 10466
const PL_COLS = [1100, 2100, 4766, 2500];

function buildPlanSection(floors, building) {
  const children = [];

  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 200 },
    children: [run(`${building} — Floor Plans`, { size: 36, bold: true, color: COLOURS.textDark })],
  }));

  for (let fi = 0; fi < floors.length; fi++) {
    const { floor, components, imageBase64, imageWidth, imageHeight } = floors[fi];

    if (fi > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    children.push(new Paragraph({
      heading:  HeadingLevel.HEADING_2,
      spacing:  { before: 0, after: 160 },
      children: [run(`${floor.short_name} — ${floor.name}`, { size: 26, bold: true, color: COLOURS.subheading })],
    }));

    // Plan image
    if (imageBase64 && imageWidth && imageHeight) {
      const maxPts = 520;   // max width in points (fits A4 with margins)
      const scale  = Math.min(1, maxPts / imageWidth);
      const dW     = Math.round(imageWidth  * scale);
      const dH     = Math.round(imageHeight * scale);

      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing:   { before: 160, after: 200 },
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
        'No plan image available for this floor. Set up a plan in the Plan View tab.',
        { italics: true, size: 16, color: COLOURS.textMuted, after: 200 }
      ));
    }

    // Placed components table (only those with a position)
    const placed = components.filter(c => c.x_position != null || imageBase64);  // show all components for the floor list
    if (placed.length === 0) {
      children.push(para('No components on this floor.', { after: 160, size: 18 }));
      continue;
    }

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        hCell('Asset ID', PL_COLS[0]),
        hCell('Type',     PL_COLS[1]),
        hCell('Label',    PL_COLS[2]),
        hCell('Status',   PL_COLS[3]),
      ],
    });

    const dataRows = placed.map((c, idx) => {
      const alt = idx % 2 === 1;
      return new TableRow({
        children: [
          dCell(c.asset_id  ?? '—', PL_COLS[0], { alt }),
          dCell(c.type_name ?? '—', PL_COLS[1], { alt }),
          dCell(c.label     ?? '—', PL_COLS[2], { alt }),
          statusCell(c.status, PL_COLS[3], alt),
        ],
      });
    });

    children.push(new Table({
      width:   { size: CONTENT_W, type: WidthType.DXA },
      borders: BORDERS,
      rows:    [headerRow, ...dataRows],
    }));

    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  return children;
}

// ── Summary section ───────────────────────────────────────────────────────────
// Pivot: System | Type | OK | Problem | Failed | Inactive | Total
// Width: 2200 | 2200 | 1000 | 1200 | 1000 | 1200 | 866 (but recalc to = 10466 exactly? let's do even)
// Actually: 2000 | 2000 | 1100 | 1200 | 1100 | 1200 | 1866 = 10466
const SM_COLS = [2000, 2200, 1050, 1200, 1050, 1200, 1766];

function buildSummarySection(summaryRows, building, filterSummary) {
  const children = [];

  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 200 },
    children: [run(`${building} — Summary`, { size: 36, bold: true, color: COLOURS.textDark })],
  }));

  if (filterSummary && filterSummary !== 'All components') {
    children.push(para([
      run('Filters: ', { bold: true, size: 18 }),
      run(filterSummary, { italics: true, size: 18, color: COLOURS.textMuted }),
    ], { after: 200 }));
  }

  if (summaryRows.length === 0) {
    children.push(para('No components match the current filters.', { after: 160 }));
    return children;
  }

  // Pivot: group by system+type, aggregate by status
  const pivotMap = {};
  for (const row of summaryRows) {
    const key = `${row.system_name}|${row.type_name}`;
    if (!pivotMap[key]) {
      pivotMap[key] = {
        system_name: row.system_name,
        type_name:   row.type_name,
        ok:          0,
        problem:     0,
        failed:      0,
        inactive:    0,
      };
    }
    const status = row.status?.toLowerCase?.() ?? '';
    if (status in pivotMap[key]) pivotMap[key][status] += row.count;
  }

  const pivot = Object.values(pivotMap).sort((a, b) =>
    a.system_name.localeCompare(b.system_name) || a.type_name.localeCompare(b.type_name)
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

  const dataRows = pivot.map((row) => {
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

  // Grand total row
  const grandOk       = pivot.reduce((s, r) => s + r.ok,       0);
  const grandProblem  = pivot.reduce((s, r) => s + r.problem,   0);
  const grandFailed   = pivot.reduce((s, r) => s + r.failed,    0);
  const grandInactive = pivot.reduce((s, r) => s + r.inactive,  0);
  const grandTotal    = grandOk + grandProblem + grandFailed + grandInactive;

  const totalRow = new TableRow({
    children: [
      hCell('TOTAL', SM_COLS[0] + SM_COLS[1], { fill: COLOURS.headerFill }),
      numCell(grandOk,       SM_COLS[2], COLOURS.textWhite),
      numCell(grandProblem,  SM_COLS[3], COLOURS.textWhite),
      numCell(grandFailed,   SM_COLS[4], COLOURS.textWhite),
      numCell(grandInactive, SM_COLS[5], COLOURS.textWhite),
      new TableCell({
        width:         { size: SM_COLS[6], type: WidthType.DXA },
        margins:       CELL_PAD,
        borders:       BORDERS,
        shading:       { fill: COLOURS.headerFill, type: ShadingType.CLEAR },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing:   { before: 0, after: 0 },
          children:  [run(String(grandTotal), { size: 18, bold: true, color: COLOURS.textWhite })],
        })],
      }),
    ],
  });

  children.push(new Table({
    width:   { size: CONTENT_W, type: WidthType.DXA },
    borders: BORDERS,
    rows:    [headerRow, ...dataRows, totalRow],
  }));

  return children;
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST({ request }) {
  logger('📄 POST /api/v2/generate-report');

  try {
    const body = await request.json();
    const { options = {}, floors = [], summary = [] } = body;

    const { reportTypes = [], building = 'Lancaster House', filterSummary = '', generatedAt = '' } = options;

    if (!reportTypes.length) {
      return json({ error: 'No report sections requested.' }, { status: 400 });
    }
    if (!floors.length) {
      return json({ error: 'No floor data supplied.' }, { status: 400 });
    }

    logger('Report types:', reportTypes.join(', '), '| Floors:', floors.length, '| Building:', building);

    const docTitle = `${building} — Component Report`;
    const genAt    = generatedAt || new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    // ── Assemble document content ─────────────────────────────────────────────
    const sections = [];
    const wantList    = reportTypes.includes('full_list');
    const wantPlan    = reportTypes.includes('plan');
    const wantSummary = reportTypes.includes('summary');

    // Each requested section becomes its own document section (independent page numbering
    // not needed, but clean breaks between logical sections).
    // We use a single section with page breaks between logical blocks.
    const children = [];
    let firstSection = true;

    if (wantList) {
      if (!firstSection) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(...buildFullListSection(floors, building, filterSummary));
      firstSection = false;
    }

    if (wantPlan) {
      if (!firstSection) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(...buildPlanSection(floors, building));
      firstSection = false;
    }

    if (wantSummary) {
      if (!firstSection) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(...buildSummarySection(summary, building, filterSummary));
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
