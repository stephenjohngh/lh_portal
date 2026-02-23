// src/routes/api/plans/generate-inspections-report/+server.js
// Generate Word document inspection reports.
//
// Summary:  Cover page + one table row per session. Pass/fail totals at a glance.
// Detailed: Cover page + one section per session, full inspection table.
//
// Request body:
//   { sessions: [{ session, inspections }], reportType: 'summary' | 'detailed' }

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  PageBreak,
  WidthType, HeadingLevel, BorderStyle, ShadingType,
  Header, Footer, PageNumber, AlignmentType,
  VerticalAlign
} from 'docx';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('generateInspectionsReport');

// ── Page geometry (A4 portrait) ────────────────────────────────────────────
const PAGE_W    = 11906;
const PAGE_H    = 16838;
const MARGIN    = 720;   // 0.5 inch
const CONTENT_W = PAGE_W - 2 * MARGIN;   // 10466 DXA

// ── Shared helpers ─────────────────────────────────────────────────────────
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };

const BORDER_LIGHT = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const BORDERS_ALL = {
  top: BORDER_LIGHT, bottom: BORDER_LIGHT,
  left: BORDER_LIGHT, right: BORDER_LIGHT,
  insideHorizontal: BORDER_LIGHT, insideVertical: BORDER_LIGHT
};

function txt(text, opts = {}) {
  return new TextRun({
    text: String(text ?? ''),
    font: 'Arial',
    size: opts.size ?? 18,
    bold:    opts.bold    ?? false,
    italics: opts.italics ?? false,
    color:   opts.color
  });
}

function para(children, opts = {}) {
  const runs = typeof children === 'string'
    ? [txt(children, opts)]
    : children;
  return new Paragraph({
    alignment: opts.align,
    spacing:   { before: opts.before ?? 0, after: opts.after ?? 120 },
    border:    opts.border,
    children:  runs
  });
}

function hcell(text, widthDxa, opts = {}) {
  return new TableCell({
    width:    { size: widthDxa, type: WidthType.DXA },
    margins:  CELL_MARGINS,
    borders:  BORDERS_ALL,
    shading:  { fill: opts.fill ?? '1E3A5F', type: ShadingType.CLEAR },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [txt(text, { bold: true, size: opts.size ?? 16, color: opts.color ?? 'FFFFFF' })]
    })]
  });
}

function dcell(text, widthDxa, opts = {}) {
  const fillColor = opts.fill ?? (opts.alt ? 'F1F5F9' : 'FFFFFF');
  return new TableCell({
    width:    { size: widthDxa, type: WidthType.DXA },
    margins:  CELL_MARGINS,
    borders:  BORDERS_ALL,
    shading:  { fill: fillColor, type: ShadingType.CLEAR },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [txt(String(text ?? '—'), { size: opts.size ?? 18, bold: opts.bold, color: opts.color })]
    })]
  });
}

// ── Formatters ─────────────────────────────────────────────────────────────
const FLOOR_MAP = { L:'Lower', U:'Upper', G:'Ground', '1':'First', '2':'Second',
                    '3':'Third', '4':'Fourth', '5':'Fifth', '6':'Sixth', '7':'Seventh' };

function floorLabel(fl) {
  const v = String(fl ?? '');
  return FLOOR_MAP[v] ? `${v} — ${FLOOR_MAP[v]}` : v;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
  });
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

function duration(session) {
  if (!session.closed_at) return 'Open';
  const min = Math.round((new Date(session.closed_at) - new Date(session.started_at)) / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

function typeLabel(t) {
  const map = { communal_door:'Communal Door', apartment_door:'Apartment Door',
                light:'Light', fire_control:'Fire Control' };
  return map[t] ?? t;
}

function sessionStats(inspections) {
  const pass = inspections.filter(r => r.result === 'pass').length;
  const fail = inspections.filter(r => r.result === 'fail').length;
  const na   = inspections.filter(r => r.result === 'na').length;
  const els  = new Set(inspections.map(r => r.element_id)).size;
  return { pass, fail, na, elements: els, total: inspections.length };
}

function resultColor(result) {
  return result === 'pass' ? '16A34A' : result === 'fail' ? 'DC2626' : '6B7280';
}

// ── Document header / footer ───────────────────────────────────────────────
function makeHeader(title, generatedAt) {
  return new Header({
    children: [para(
      [txt(title, { size: 16, color: '555555' }),
       txt('   '),
       txt(generatedAt, { size: 16, color: '9CA3AF' })],
      { after: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C8D0DC', space: 4 } } }
    )]
  });
}

function makeFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing:   { before: 0, after: 0 },
      children:  [
        txt('Page ', { size: 16, color: '9CA3AF' }),
        new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '9CA3AF' }),
        txt(' of ', { size: 16, color: '9CA3AF' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 16, color: '9CA3AF' })
      ]
    })]
  });
}

// ── Cover / title block ────────────────────────────────────────────────────
function buildCover(sessions, reportType, generatedAt) {
  const buildings = [...new Set(sessions.map(s => s.building))].sort();
  const title = reportType === 'summary' ? 'Inspection Summary Report' : 'Inspection Detailed Report';

  return [
    para([txt(title, { size: 48, bold: true, color: '1E293B' })], { after: 200 }),
    para([txt(buildings.join(', '), { size: 24, color: '475569' })], { after: 80 }),
    para([txt(`Generated: ${generatedAt}`, { size: 20, color: '9CA3AF' })], { after: 80 }),
    para([txt(`${sessions.length} session${sessions.length !== 1 ? 's' : ''}`, { size: 20, color: '9CA3AF' })], { after: 400 }),
    para('', { after: 0 })
  ];
}

// ── Summary report ─────────────────────────────────────────────────────────
// Columns: Date | Building | Floor | Type | Inspector | Duration | Elements | Pass | Fail | N/A | Notes

const SUM_COLS = [1200, 1400, 900, 1300, 1300, 800, 700, 600, 600, 600, 1066];
// sum = 10466 = CONTENT_W

function buildSummaryTable(sessionData) {
  const headers = ['Date', 'Building', 'Floor', 'Type', 'Inspector', 'Duration',
                   'Elements', 'Pass', 'Fail', 'N/A', 'Notes'];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => hcell(h, SUM_COLS[i]))
  });

  const dataRows = sessionData.map(({ session: s, inspections }, idx) => {
    const st  = sessionStats(inspections);
    const alt = idx % 2 === 1;
    return new TableRow({
      children: [
        dcell(fmtDate(s.started_at),              SUM_COLS[0],  { alt }),
        dcell(s.building,                          SUM_COLS[1],  { alt }),
        dcell(floorLabel(s.floor_level),           SUM_COLS[2],  { alt }),
        dcell(typeLabel(s.element_type) + (s.light_subtype_filter === 'emergency' ? ' (Emerg.)' : ''),
                                                   SUM_COLS[3],  { alt }),
        dcell(s.inspector_name || '—',             SUM_COLS[4],  { alt }),
        dcell(duration(s),                         SUM_COLS[5],  { alt }),
        dcell(st.elements,                         SUM_COLS[6],  { alt, bold: true }),
        dcell(st.pass || '—',                      SUM_COLS[7],  { alt, color: st.pass  ? '16A34A' : '9CA3AF' }),
        dcell(st.fail || '—',                      SUM_COLS[8],  { alt, color: st.fail  ? 'DC2626' : '9CA3AF' }),
        dcell(st.na   || '—',                      SUM_COLS[9],  { alt, color: st.na    ? '6B7280' : '9CA3AF' }),
        dcell(s.notes || '',                       SUM_COLS[10], { alt })
      ]
    });
  });

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: SUM_COLS,
    rows: [headerRow, ...dataRows]
  });
}

// ── Detailed report — one section per session ──────────────────────────────
// Each session: heading block + inspection table.
// Inspection table columns: Asset ID | Subtype | Result | Time | Notes

const DET_COLS = [1400, 1500, 900, 1200, 5466];
// sum = 10466 = CONTENT_W

function buildDetailedSession({ session: s, inspections }, isFirst) {
  const children = [];

  if (!isFirst) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  const st = sessionStats(inspections);

  // Session heading
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 160 },
    children: [txt(`${s.building} — Floor ${floorLabel(s.floor_level)} — ${typeLabel(s.element_type)}`,
                   { size: 32, bold: true })]
  }));

  // Metadata block — 2-column key/value table
  const META_L = 1800, META_R = CONTENT_W - META_L;
  function metaRow(label, value, valueColor) {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: META_L, type: WidthType.DXA }, margins: CELL_MARGINS,
          borders: BORDERS_ALL, shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
          children: [new Paragraph({ spacing: { before: 0, after: 0 },
            children: [txt(label, { bold: true, size: 18, color: '475569' })] })]
        }),
        new TableCell({
          width: { size: META_R, type: WidthType.DXA }, margins: CELL_MARGINS,
          borders: BORDERS_ALL, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
          children: [new Paragraph({ spacing: { before: 0, after: 0 },
            children: [txt(String(value ?? '—'), { size: 18, color: valueColor })] })]
        })
      ]
    });
  }

  const metaRows = [
    metaRow('Session Name',  s.session_name || '—'),
    metaRow('Date / Time',   fmtDateTime(s.started_at)),
    metaRow('Inspector',     s.inspector_name || '—'),
    metaRow('Duration',      duration(s)),
    metaRow('Status',        s.status === 'open' ? 'Open' : 'Closed',
                             s.status === 'open' ? 'D97706' : '6B7280'),
    metaRow('Elements',      `${st.elements} inspected (${st.total} records)`),
    metaRow('Results',       `Pass: ${st.pass}   Fail: ${st.fail}   N/A: ${st.na}`),
  ];
  if (s.notes) metaRows.push(metaRow('Closing Notes', s.notes));
  if (s.light_subtype_filter === 'emergency') metaRows.push(metaRow('Filter', 'Emergency lights only', 'D97706'));

  children.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [META_L, META_R],
    rows: metaRows
  }));

  children.push(para('', { after: 200 }));

  // Inspection table
  if (!inspections.length) {
    children.push(para('No inspections recorded in this session.', { italics: true, color: '9CA3AF' }));
    return children;
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hcell('Asset ID',  DET_COLS[0]),
      hcell('Subtype',   DET_COLS[1]),
      hcell('Result',    DET_COLS[2]),
      hcell('Time',      DET_COLS[3]),
      hcell('Notes',     DET_COLS[4])
    ]
  });

  const dataRows = inspections.map((ins, idx) => {
    const alt = idx % 2 === 1;
    return new TableRow({
      children: [
        dcell(ins.asset_id || '—',  DET_COLS[0], { alt, bold: true }),
        dcell(ins.subtype  || '—',  DET_COLS[1], { alt }),
        dcell(ins.result?.toUpperCase() ?? '—', DET_COLS[2],
              { alt, bold: true, color: resultColor(ins.result) }),
        dcell(fmtTime(ins.inspected_at),  DET_COLS[3], { alt }),
        dcell(ins.notes || '',            DET_COLS[4], { alt })
      ]
    });
  });

  children.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: DET_COLS,
    rows: [headerRow, ...dataRows]
  }));

  return children;
}

// ── POST handler ───────────────────────────────────────────────────────────
export async function POST({ request }) {
  logger('📄 POST /api/plans/generate-inspections-report');

  try {
    const { sessions, reportType } = await request.json();

    if (!sessions?.length) return json({ error: 'No sessions supplied' }, { status: 400 });

    const generatedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const titleLabel = reportType === 'summary' ? 'Inspection Summary' : 'Inspection Report';
    const buildings  = [...new Set(sessions.map(d => d.session.building))].sort().join(', ');

    // Build document content
    const children = [
      ...buildCover(sessions.map(d => d.session), reportType, generatedAt)
    ];

    if (reportType === 'summary') {
      children.push(buildSummaryTable(sessions));
    } else {
      for (let i = 0; i < sessions.length; i++) {
        children.push(...buildDetailedSession(sessions[i], i === 0));
      }
    }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 18 } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 32, bold: true, font: 'Arial', color: '1E293B' },
            paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
        ]
      },
      sections: [{
        properties: {
          page: {
            size:   { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
          }
        },
        headers: { default: makeHeader(`${buildings} — ${titleLabel}`, generatedAt) },
        footers: { default: makeFooter() },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    logger('✅ Generated', reportType, 'report | sessions:', sessions.length, '| size:', buffer.byteLength);

    const slug     = reportType === 'summary' ? 'Summary' : 'Detailed';
    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `Inspections_${slug}_${dateSlug}.docx`;

    return new Response(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (err) {
    logger('❌ Error:', err.message, err.stack);
    return json({ error: err.message }, { status: 500 });
  }
}
