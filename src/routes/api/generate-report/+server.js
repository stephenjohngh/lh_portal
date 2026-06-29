// src/routes/api/generate-report/+server.js
// Generate a Word document report for building asset components.
//
// Accepts: { options, floors }
//   options: { reportTypes, building, filterSummary, generatedAt }
//   floors:  [{ floor, components, imageBase64, imageWidth, imageHeight }]
//
// reportTypes: array of one or more:
//   'plan'                — plan graphic per floor
//   'full_list'           — full component table per floor (no System col)
//   'floor_summary'       — type/status count table per floor
//   'full_component_list' — all-floors combined component table (after per-floor content)
//   'full_summary'        — aggregate pivot across all floors (after full_component_list)
//
// Each floor's content is grouped together. Page break between floors.
// Separate final sections follow in order: full_component_list → full_summary.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
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
  CONTENT_W, CONTENT_W_L, COLOURS, BORDERS, CELL_PAD,
  hCell, dCell, run, para,
  makeHeader, makeFooter,
  DOC_STYLES, pageProps,
} from '$lib/server/docxHelpers.js';
import { sortBySystemTypeAsset } from '$lib/utils/componentSorting.js';
import { fmtGenerated, fmtShortDate } from '$lib/utils/dates.js';

const logger = getLogger('generateReport');

// -- Condition sub-row ---------------------------------------------------------
// Returns a TableRow listing "Condition (date): ✓ Gap · ✓ Closer · ✗ Smoke seal"
// for one component, or null when the component has no condition attrs / no
// inspection. Caller filters out nulls. Used in both buildComponentTable and
// buildFullComponentListTable.
function buildConditionSubRow(c, columnSpan, alt) {
  const items = Array.isArray(c.condition_results) ? c.condition_results : [];
  if (items.length === 0) return null;

  const dateStr = c.last_inspected ? fmtShortDate(c.last_inspected) : null;
  const runs = [];
  runs.push(new TextRun({
    text:  dateStr ? `Condition (${dateStr}):  ` : 'Condition:  ',
    bold:  true,
    color: '475569',
    font:  'Arial',
    size:  16,
  }));
  items.forEach((it, j) => {
    if (j > 0) runs.push(new TextRun({ text: '  ·  ', color: '94A3B8', font: 'Arial', size: 16 }));
    const glyph  = it.passed === true ? '✓ ' : it.passed === false ? '✗ ' : '— ';
    const colour = it.passed === true ? '15803D' : it.passed === false ? 'B91C1C' : '6B7280';
    runs.push(new TextRun({
      text:  `${glyph}${it.name}`,
      bold:  it.passed === false,
      color: colour,
      font:  'Arial',
      size:  16,
    }));
  });

  return new TableRow({
    children: [new TableCell({
      width:      { size: CONTENT_W, type: WidthType.DXA },
      columnSpan,
      shading:    { fill: alt ? 'F8FAFC' : 'FFFFFF', type: ShadingType.CLEAR },
      margins:    CELL_PAD,
      children:   [new Paragraph({
        spacing:  { before: 0, after: 0 },
        children: runs,
      })],
    })],
  });
}

// -- Status helpers ------------------------------------------------------------
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

// -- Attribute formatting ------------------------------------------------------
// number   → "name: value"  (bare number is meaningless without its label)
// dropdown → "value"        (the selected option is the meaningful text)
// others   → "name"         (presence of the attr is what matters; value is implied)
function fmtAttrs(attributes) {
  return (attributes ?? [])
    .map(a => {
      if (a.display_type === 'number')   return `${a.name}: ${a.value}`;
      if (a.display_type === 'dropdown') return a.value;
      return a.name;
    })
    .join('\n');
}

// -- Sort helper ---------------------------------------------------------------
function sortComponents(comps) {
  return [...comps].sort(sortBySystemTypeAsset);
}

// -- Full component list table (all floors combined) ---------------------------
// Fixed columns: Floor | Type | Id | Label | Attributes | Status
// Optional (each independent): Linked | Notes | Insp. Notes
// Total content width: 10466 DXA. Label/Attrs share remaining space ~60/40.

function buildFullComponentListTable(components, colOpts = {}) {
  const { showNotes = false, showLinked = false, showInspectionNotes = false,
          showAttributes = true, showConditions = true } = colOpts;

  const FLOOR_W = 400;
  const TYPE_W  = 1600;
  const ID_W    = 560;
  const STAT_W  = 1000;
  const LINK_W  = showLinked          ? 1000 : 0;
  const NOTE_W  = showNotes           ? 1400 : 0;
  const INSP_W  = showInspectionNotes ? 1200 : 0;
  const remain  = CONTENT_W - FLOOR_W - TYPE_W - ID_W - STAT_W - LINK_W - NOTE_W - INSP_W;
  // When the Attributes column is hidden, Label takes the freed width.
  const LABEL_W = showAttributes ? Math.round(remain * 0.60) : remain;
  const ATTR_W  = showAttributes ? remain - LABEL_W : 0;

  const colWidths = [FLOOR_W, TYPE_W, ID_W, LABEL_W,
    ...(showAttributes      ? [ATTR_W] : []),
    ...(showLinked          ? [LINK_W] : []),
    ...(showNotes           ? [NOTE_W] : []),
    ...(showInspectionNotes ? [INSP_W] : []),
    STAT_W];

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('F',           FLOOR_W),
      hCell('Type',        TYPE_W),
      hCell('Id',          ID_W),
      hCell('Label',       LABEL_W),
      ...(showAttributes      ? [hCell('Attributes',  ATTR_W)] : []),
      ...(showLinked          ? [hCell('Linked',      LINK_W)] : []),
      ...(showNotes           ? [hCell('Notes',       NOTE_W)] : []),
      ...(showInspectionNotes ? [hCell('Insp. Notes', INSP_W)] : []),
      hCell('Status',      STAT_W),
    ],
  });

  // components arrive pre-sorted (floor_order → system → type → asset_id) from client
  const dataRows = components.flatMap((c, idx) => {
    const alt   = idx % 2 === 1;
    const attrs = fmtAttrs(c.attributes);
    const main  = new TableRow({
      children: [
        dCell(c.floor_short  ?? '—', FLOOR_W, { alt }),
        dCell(c.type_name    ?? '—', TYPE_W,  { alt }),
        dCell(c.asset_id     ?? '—', ID_W,    { alt }),
        dCell(c.label        ?? '—', LABEL_W, { alt }),
        ...(showAttributes      ? [dCell(attrs || '—',                   ATTR_W, { alt })] : []),
        ...(showLinked          ? [dCell(c.linked_component_ref ?? '', LINK_W, { alt })] : []),
        ...(showNotes           ? [dCell(c.notes      ?? '',           NOTE_W, { alt })] : []),
        ...(showInspectionNotes ? [dCell(c.last_notes ?? '',           INSP_W, { alt })] : []),
        statusCell(c.status, STAT_W, alt),
      ],
    });
    // Sub-row with condition checklist; null when the component has no
    // condition attrs or no inspection, or when conditions are toggled off.
    const sub = showConditions ? buildConditionSubRow(c, colWidths.length, alt) : null;
    return sub ? [main, sub] : [main];
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: colWidths,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows],
  });
}

function buildFullComponentListSection(allComponents, building, filterSummary, colOpts = {}) {
  const children = [];

  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 200 },
    children: [run(`${building} — Full Component List`, { size: 36, bold: true, color: COLOURS.textDark })],
  }));

  if (filterSummary && filterSummary !== 'All components') {
    children.push(para([
      run('Filters: ', { bold: true, size: 18 }),
      run(filterSummary, { italics: true, size: 18, color: COLOURS.textMuted }),
    ], { after: 200 }));
  }

  children.push(para([
    run(`${allComponents.length} component${allComponents.length === 1 ? '' : 's'} total`,
      { size: 18, color: COLOURS.textMuted }),
  ], { after: 160 }));

  if (allComponents.length === 0) {
    children.push(para('No components match the current filters.', { after: 160 }));
    return children;
  }

  children.push(buildFullComponentListTable(allComponents, colOpts));
  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  return children;
}

// -- Full component table (per floor) -----------------------------------------
// Fixed columns: Type | Id | Label | Attributes | Status
// Optional (each independent): Linked | Notes | Insp. Notes
// Total content width: 10466 DXA. Label/Attrs share remaining space ~55/45.

function buildComponentTable(components, colOpts = {}) {
  const { showNotes = false, showLinked = false, showInspectionNotes = false,
          showAttributes = true, showConditions = true } = colOpts;

  const TYPE_W  = 1800;
  const ID_W    = 560;
  const STAT_W  = 790;
  const LINK_W  = showLinked          ? 1100 : 0;
  const NOTE_W  = showNotes           ? 1500 : 0;
  const INSP_W  = showInspectionNotes ? 1400 : 0;
  const remain  = CONTENT_W - TYPE_W - ID_W - STAT_W - LINK_W - NOTE_W - INSP_W;
  // When the Attributes column is hidden, Label takes the freed width.
  const LABEL_W = showAttributes ? Math.round(remain * 0.55) : remain;
  const ATTR_W  = showAttributes ? remain - LABEL_W : 0;

  const colWidths = [TYPE_W, ID_W, LABEL_W,
    ...(showAttributes      ? [ATTR_W] : []),
    ...(showLinked          ? [LINK_W] : []),
    ...(showNotes           ? [NOTE_W] : []),
    ...(showInspectionNotes ? [INSP_W] : []),
    STAT_W];

  const sorted = sortComponents(components);

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('Type',        TYPE_W),
      hCell('Id',          ID_W),
      hCell('Label',       LABEL_W),
      ...(showAttributes      ? [hCell('Attributes',  ATTR_W)] : []),
      ...(showLinked          ? [hCell('Linked',      LINK_W)] : []),
      ...(showNotes           ? [hCell('Notes',       NOTE_W)] : []),
      ...(showInspectionNotes ? [hCell('Insp. Notes', INSP_W)] : []),
      hCell('Status',      STAT_W),
    ],
  });

  const dataRows = sorted.flatMap((c, idx) => {
    const alt   = idx % 2 === 1;
    const attrs = fmtAttrs(c.attributes);
    const main  = new TableRow({
      children: [
        dCell(c.type_name  ?? '—', TYPE_W,  { alt }),
        dCell(c.asset_id   ?? '—', ID_W,    { alt }),
        dCell(c.label      ?? '—', LABEL_W, { alt }),
        ...(showAttributes      ? [dCell(attrs || '—',                   ATTR_W, { alt })] : []),
        ...(showLinked          ? [dCell(c.linked_component_ref ?? '', LINK_W, { alt })] : []),
        ...(showNotes           ? [dCell(c.notes      ?? '',           NOTE_W, { alt })] : []),
        ...(showInspectionNotes ? [dCell(c.last_notes ?? '',           INSP_W, { alt })] : []),
        statusCell(c.status, STAT_W, alt),
      ],
    });
    const sub = showConditions ? buildConditionSubRow(c, colWidths.length, alt) : null;
    return sub ? [main, sub] : [main];
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: colWidths,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows],
  });
}

// -- Per-floor summary pivot table ---------------------------------------------
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
        numCell(total,         FS_COLS[6], COLOURS.textDark),
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

// -- Full summary pivot table (System | Type | OK | Problem | Failed | Inactive | Total) --
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
        numCell(total,        SM_COLS[6], COLOURS.textDark),
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

// -- POST handler --------------------------------------------------------------
export async function POST({ request }) {
  // Authenticated users only — these endpoints render caller-supplied data
  // into official-looking documents and burn server compute; neither should
  // be reachable anonymously.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  logger('📄 POST /api/generate-report');

  try {
    const body = await request.json();
    const { options = {}, floors = [], allComponents = [] } = body;

    const {
      reportTypes          = [],
      building             = 'Lancaster House',
      filterSummary        = '',
      generatedAt          = '',
      showNotes            = false,
      showLinked           = false,
      showInspectionNotes  = false,
      showAttributes       = true,
      showConditions       = true,
    } = options;
    const colOpts = { showNotes, showLinked, showInspectionNotes, showAttributes, showConditions };

    if (!reportTypes.length) {
      return json({ error: 'No report sections requested.' }, { status: 400 });
    }
    if (!floors.length) {
      return json({ error: 'No floor data supplied.' }, { status: 400 });
    }

    const wantPlan              = reportTypes.includes('plan');
    const wantList              = reportTypes.includes('full_list');
    const wantFloorSummary      = reportTypes.includes('floor_summary');
    const wantFullSummary       = reportTypes.includes('full_summary');
    const wantFullComponentList = reportTypes.includes('full_component_list');

    // Plan-only report → one landscape page per floor, plan filling the page.
    const planOnly = wantPlan && !wantList && !wantFloorSummary
                  && !wantFullSummary && !wantFullComponentList;

    logger('Report types:', reportTypes.join(', '), '| Floors:', floors.length, '| Building:', building);

    const docTitle = `${building} — Component Report`;
    const genAt    = generatedAt || fmtGenerated();

    // -- Assemble document -----------------------------------------------------
    const children = [];

    // Document title + filter summary.
    // Skipped for plan-only reports so the first floor's plan starts at the top
    // of the page (the title still appears in the running header).
    if (!planOnly) {
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
    }

    // -- Per-floor content -----------------------------------------------------
    // Only iterate floors when at least one per-floor section is requested.
    // If only final sections (full_component_list / full_summary) are selected,
    // skip this loop entirely — otherwise each floor emits a heading with nothing below it.
    const wantAnyPerFloor = wantPlan || wantList || wantFloorSummary;
    for (let fi = 0; wantAnyPerFloor && fi < floors.length; fi++) {
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

      // -- Plan graphic ------------------------------------------------------
      if (wantPlan) {
        if (imageBase64 && imageWidth && imageHeight) {
          // Display size in px @96dpi. Plan-only reports fill the A4 landscape
          // content box, leaving headroom for the floor heading so the heading
          // and image stay on the SAME page (an image can't be split, so an
          // over-tall one gets bumped to the next page on its own). Landscape
          // content is ~1026 x 698 px; reserve ~95 px of height for the
          // heading + paragraph spacing. Otherwise: portrait-friendly cap,
          // never enlarged.
          let dW, dH;
          if (planOnly) {
            const MAX_W = 1000, MAX_H = 600;
            const s = Math.min(MAX_W / imageWidth, MAX_H / imageHeight);
            dW = Math.round(imageWidth  * s);
            dH = Math.round(imageHeight * s);
          } else {
            const maxPts = 520;
            const scale  = Math.min(1, maxPts / imageWidth);
            dW = Math.round(imageWidth  * scale);
            dH = Math.round(imageHeight * scale);
          }

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

      // -- Full component table ----------------------------------------------
      if (wantList) {
        children.push(buildComponentTable(components, colOpts));
        children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
      }

      // -- Floor summary table -----------------------------------------------
      if (wantFloorSummary) {
        children.push(para('Floor Summary', { bold: true, size: 20, before: 120, after: 100 }));
        const fsTable = buildFloorSummaryTable(components);
        if (fsTable) {
          children.push(fsTable);
          children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
        }
      }
    }

    // -- Full component list section (all floors combined) ---------------------
    if (wantFullComponentList) {
      // Only add a page break if there was preceding per-floor content
      if (wantAnyPerFloor) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(...buildFullComponentListSection(allComponents, building, filterSummary, colOpts));
    }

    // -- Full summary section (all floors combined) ----------------------------
    if (wantFullSummary) {
      // Add a page break if there was any preceding content beyond the title
      if (wantAnyPerFloor || wantFullComponentList) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(...buildFullSummarySection(floors, building, filterSummary));
    }

    // -- Build document --------------------------------------------------------
    const doc = new Document({
      styles:   DOC_STYLES,
      sections: [{
        properties: pageProps({ landscape: planOnly }),
        headers:    { default: makeHeader(docTitle, genAt, planOnly ? CONTENT_W_L : CONTENT_W) },
        footers:    { default: makeFooter() },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    logger('✅ Report generated, size:', buffer.byteLength, 'bytes');

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
