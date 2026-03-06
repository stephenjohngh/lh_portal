// src/routes/api/plans/generate-inspections-report/+server.js
// Generate Word document inspection reports.
//
// Summary:  Cover page + one table row per session.
// Detailed: Cover page + one section per session, full inspection table.
//
// Request body:
//   { sessions: [{ session, inspections }], reportType: 'summary' | 'detailed' }

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow,
  PageBreak,
  WidthType, HeadingLevel,
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  hCell, dCell, makeHeader, makeFooter, DOC_STYLES, pageProps,
  CONTENT_W, floorLabel, COLOURS,
} from '$lib/server/docxHelpers';
import { sessionStats } from '$lib/apps/walk/utils/walkHelpers';
import { fmtGenerated, fmtDate, fmtDateTime, fmtTime, fmtDuration } from '$lib/utils/dates';

const logger = getLogger('generateInspectionsReport');

// ── Type label ─────────────────────────────────────────────────────────────────
function typeLabel(t) {
  return {
    communal_door:  'Communal Door',
    apartment_door: 'Apartment Door',
    light:          'Light',
    fire_control:   'Fire Control',
  }[t] ?? t;
}

function resultColor(result) {
  return result === 'pass' ? COLOURS.passGreen
       : result === 'fail' ? COLOURS.failRed
       : '6B7280';
}

// ── Cover / title block ────────────────────────────────────────────────────────
function buildCover(sessions, reportType, generatedAt) {
  const buildings = [...new Set(sessions.map(s => s.building))].sort();
  const title = reportType === 'summary' ? 'Inspection Summary Report' : 'Inspection Detailed Report';

  return [
    new Paragraph({
      spacing:  { after: 200 },
      children: [new TextRun({ text: title, font: 'Arial', size: 48, bold: true, color: COLOURS.textDark })],
    }),
    new Paragraph({
      spacing:  { after: 80 },
      children: [new TextRun({ text: buildings.join(', '), font: 'Arial', size: 24, color: '475569' })],
    }),
    new Paragraph({
      spacing:  { after: 80 },
      children: [new TextRun({ text: `Generated: ${generatedAt}`, font: 'Arial', size: 20, color: COLOURS.textMuted })],
    }),
    new Paragraph({
      spacing:  { after: 400 },
      children: [new TextRun({ text: `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`, font: 'Arial', size: 20, color: COLOURS.textMuted })],
    }),
  ];
}

// ── Summary report ─────────────────────────────────────────────────────────────
// Columns: Date | Building | Floor | Type | Inspector | Duration | Elements | Pass | Fail | N/A | Notes
const SUM_COLS = [1200, 1400, 900, 1300, 1300, 800, 700, 600, 600, 600, 1066];
// sum = 10466 = CONTENT_W

function buildSummaryTable(sessionData) {
  const headers = ['Date', 'Building', 'Floor', 'Type', 'Inspector', 'Duration',
                   'Elements', 'Pass', 'Fail', 'N/A', 'Notes'];

  const headerRow = new TableRow({
    tableHeader: true,
    children:    headers.map((h, i) => hCell(h, SUM_COLS[i])),
  });

  const dataRows = sessionData.map(({ session: s, inspections }, idx) => {
    const st  = sessionStats(inspections);
    const alt = idx % 2 === 1;
    const dur = fmtDuration(s.started_at, s.closed_at);
    const tp  = typeLabel(s.element_type) + (s.light_subtype_filter === 'emergency' ? ' (Emerg.)' : '');
    return new TableRow({
      children: [
        dCell(fmtDate(s.started_at),      SUM_COLS[0],  { alt }),
        dCell(s.building,                 SUM_COLS[1],  { alt }),
        dCell(floorLabel(s.floor_level),  SUM_COLS[2],  { alt }),
        dCell(tp,                         SUM_COLS[3],  { alt }),
        dCell(s.inspector_name,           SUM_COLS[4],  { alt }),
        dCell(dur,                        SUM_COLS[5],  { alt }),
        dCell(st.elements,                SUM_COLS[6],  { alt, bold: true }),
        dCell(st.pass || '—',             SUM_COLS[7],  { alt, color: st.pass ? COLOURS.passGreen : '9CA3AF' }),
        dCell(st.fail || '—',             SUM_COLS[8],  { alt, color: st.fail ? COLOURS.failRed   : '9CA3AF' }),
        dCell(st.na   || '—',             SUM_COLS[9],  { alt, color: st.na   ? '6B7280'          : '9CA3AF' }),
        dCell(s.notes,                    SUM_COLS[10], { alt }),
      ],
    });
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: SUM_COLS,
    rows:         [headerRow, ...dataRows],
  });
}

// ── Detailed report — one section per session ──────────────────────────────────
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
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 160 },
    children: [new TextRun({
      text: `${s.building} — ${floorLabel(s.floor_level)} — ${typeLabel(s.element_type)}`,
      font: 'Arial', size: 32, bold: true,
    })],
  }));

  // Metadata 2-column table
  const META_L = 1800;
  const META_R = CONTENT_W - META_L;

  function mkMetaRow(label, value, valueColor) {
    return new TableRow({
      children: [
        dCell(label,                META_L, { fill: 'F8FAFC', bold: true, color: '475569' }),
        dCell(String(value ?? '—'), META_R, { fill: 'FFFFFF', color: valueColor }),
      ],
    });
  }

  const metaRows = [
    mkMetaRow('Session Name', s.session_name || '—'),
    mkMetaRow('Date / Time',  fmtDateTime(s.started_at)),
    mkMetaRow('Inspector',    s.inspector_name || '—'),
    mkMetaRow('Duration',     fmtDuration(s.started_at, s.closed_at)),
    mkMetaRow('Status',       s.status === 'open' ? 'Open' : 'Closed',
                              s.status === 'open' ? COLOURS.warnAmber : '6B7280'),
    mkMetaRow('Elements',     `${st.elements} inspected (${st.total} records)`),
    mkMetaRow('Results',      `Pass: ${st.pass}   Fail: ${st.fail}   N/A: ${st.na}`),
  ];
  if (s.notes) metaRows.push(mkMetaRow('Closing Notes', s.notes));
  if (s.light_subtype_filter === 'emergency') {
    metaRows.push(mkMetaRow('Filter', 'Emergency lights only', COLOURS.warnAmber));
  }

  children.push(new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [META_L, META_R],
    rows:         metaRows,
  }));

  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Inspection table
  if (!inspections.length) {
    children.push(new Paragraph({
      spacing:  { after: 120 },
      children: [new TextRun({ text: 'No inspections recorded in this session.', italics: true, color: '9CA3AF', font: 'Arial', size: 18 })],
    }));
    return children;
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('Asset ID', DET_COLS[0]),
      hCell('Subtype',  DET_COLS[1]),
      hCell('Result',   DET_COLS[2]),
      hCell('Time',     DET_COLS[3]),
      hCell('Notes',    DET_COLS[4]),
    ],
  });

  const dataRows = inspections.map((ins, idx) => {
    const alt = idx % 2 === 1;
    return new TableRow({
      children: [
        dCell(ins.asset_id,                           DET_COLS[0], { alt, bold: true }),
        dCell(ins.subtype,                            DET_COLS[1], { alt }),
        dCell((ins.result ?? '').toUpperCase(),       DET_COLS[2], { alt, bold: true, color: resultColor(ins.result) }),
        dCell(fmtTime(ins.inspected_at),              DET_COLS[3], { alt }),
        dCell(ins.notes,                              DET_COLS[4], { alt }),
      ],
    });
  });

  children.push(new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: DET_COLS,
    rows:         [headerRow, ...dataRows],
  }));

  return children;
}

// ── POST handler ───────────────────────────────────────────────────────────────
export async function POST({ request }) {
  logger('📄 POST /api/plans/generate-inspections-report');

  try {
    const { sessions, reportType } = await request.json();

    if (!sessions?.length) return json({ error: 'No sessions supplied' }, { status: 400 });

    const generatedAt = fmtGenerated();
    const buildings   = [...new Set(sessions.map(d => d.session.building))].sort().join(', ');
    const titleLabel  = reportType === 'summary' ? 'Inspection Summary' : 'Inspection Report';

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
      styles:   DOC_STYLES,
      sections: [{
        properties: pageProps(),
        headers:    { default: makeHeader(`${buildings} — ${titleLabel}`, generatedAt) },
        footers:    { default: makeFooter() },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    logger('✅ Generated', reportType, 'report | sessions:', sessions.length, '| size:', buffer.byteLength);

    const slug     = reportType === 'summary' ? 'Summary' : 'Detailed';
    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `Inspections_${slug}_${dateSlug}.docx`;

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
