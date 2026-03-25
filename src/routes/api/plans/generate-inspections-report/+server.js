// src/routes/api/plans/generate-inspections-report/+server.js
// FIX: Changed ins.notes to ins.inspector_notes
// FIX: Added photo support in detailed reports
// FIX: Use ins.floor_level (joined from plans) for display name — s.floor_level
//      is NULL for building-wide sessions so per-element floor must be used.
//
// Generate Word document inspection reports.
//
// Summary:  Cover page + one table row per session.
// Detailed: Cover page + one section per session, full inspection table + photos.
//
// Request body:
//   { sessions: [{ session, inspections }], reportType: 'summary' | 'detailed' }

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow, TableCell,
  PageBreak, ImageRun,
  WidthType, HeadingLevel, convertInchesToTwip,
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  hCell, dCell, makeHeader, makeFooter, DOC_STYLES, pageProps,
  CONTENT_W, floorLabel, COLOURS,
} from '$lib/server/docxHelpers';
import { sessionStats } from '$lib/apps/walk/utils/walkHelpers';
import { fmtGenerated, fmtDate, fmtDateTime, fmtTime, fmtDuration } from '$lib/utils/dates';
import { typeLabel, TYPE_INITIALS } from '$lib/apps/plans/utils/reportHelpers';

const logger = getLogger('generateInspectionsReport');

function resultColor(result) {
  return result === 'OK'      ? COLOURS.passGreen
       : result === 'failed'  ? COLOURS.failRed
       : result === 'problem' ? 'EA580C'
       : '6B7280';
}

// ── Fetch image as buffer ──────────────────────────────────────────────────────
async function fetchImageBuffer(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger('⚠️ Image fetch failed:', response.status, url);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger('❌ Error fetching image:', err.message, url);
    return null;
  }
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
// Columns: Date | Building | Floor | Type | Inspector | Duration | Elements | Pass | Fail | Repair | N/A | Notes
const SUM_COLS = [1100, 1300, 800, 1200, 1200, 700, 700, 550, 550, 650, 550, 1166];
// sum = 10466 = CONTENT_W

function buildSummaryTable(sessionData) {
  const headers = ['Date', 'Building', 'Floor', 'Type', 'Inspector', 'Duration',
                   'Elements', 'Pass', 'Fail', 'Repair', 'N/A', 'Notes'];

  const headerRow = new TableRow({
    tableHeader: true,
    children:    headers.map((h, i) => hCell(h, SUM_COLS[i])),
  });

  const dataRows = sessionData.map(({ session: s, inspections }, idx) => {
    const st  = sessionStats(inspections);
    const alt = idx % 2 === 1;
    const dur = fmtDuration(s.started_at, s.closed_at);
    const tp  = typeLabel(s.element_type) + (s.light_subtype_filter === 'emergency' ? ' (Emerg.)' : '');
    // FIX: Show 'All' for building-wide sessions where floor_level is NULL
    const floorDisplay = s.floor_level ? floorLabel(s.floor_level) : 'All';
    return new TableRow({
      children: [
        dCell(fmtDate(s.started_at),  SUM_COLS[0],  { alt }),
        dCell(s.building,             SUM_COLS[1],  { alt }),
        dCell(floorDisplay,           SUM_COLS[2],  { alt }),
        dCell(tp,                     SUM_COLS[3],  { alt }),
        dCell(s.inspector_name,       SUM_COLS[4],  { alt }),
        dCell(dur,                    SUM_COLS[5],  { alt }),
        dCell(st.elements,            SUM_COLS[6],  { alt, bold: true }),
        dCell(st.OK       || '—',  SUM_COLS[7],  { alt, color: st.OK       ? COLOURS.passGreen : '9CA3AF' }),
        dCell(st.failed   || '—',  SUM_COLS[8],  { alt, color: st.failed   ? COLOURS.failRed   : '9CA3AF' }),
        dCell(st.problem  || '—',  SUM_COLS[9],  { alt, color: st.problem  ? 'EA580C'           : '9CA3AF' }),
        dCell(st.inactive || '—',  SUM_COLS[10], { alt, color: st.inactive ? '6B7280'           : '9CA3AF' }),
        dCell(s.notes,                SUM_COLS[11], { alt }),
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
// Inspection table columns: Element | Label | Result | Time | Notes
const DET_COLS = [1600, 1700, 900, 1200, 5066];
// sum = 10466 = CONTENT_W

// FIX: Use ins.floor_level (joined from plan_elements → plans) rather than
// s.floor_level which is NULL for building-wide sessions.
function getElementDisplayName(ins, sessionFloorLevel) {
  const floor = ins.floor_level ?? sessionFloorLevel ?? '?';
  const type  = TYPE_INITIALS[ins.element_type] ?? '?';
  const id    = ins.asset_id || 'No ID';
  return `${floor}/${type}/${id}`;
}

async function buildDetailedSession({ session: s, inspections }, isFirst) {
  const children = [];

  if (!isFirst) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  const st = sessionStats(inspections);
  // For building-wide sessions, floor_level is null — show 'All Floors'
  const floorDisplay = s.floor_level ? floorLabel(s.floor_level) : 'All Floors';

  // Session heading
  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 160 },
    children: [new TextRun({
      text: `${s.building} — ${floorDisplay} — ${typeLabel(s.element_type)}`,
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
    mkMetaRow('Results',      `Pass: ${st.OK}   Fail: ${st.failed}   Problem: ${st.problem}   Inactive: ${st.inactive}`),
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
      hCell('Element', DET_COLS[0]),
      hCell('Label',   DET_COLS[1]),
      hCell('Result',  DET_COLS[2]),
      hCell('Time',    DET_COLS[3]),
      hCell('Notes',   DET_COLS[4]),
    ],
  });

  const dataRows = [];
  
  for (let idx = 0; idx < inspections.length; idx++) {
    const ins = inspections[idx];
    const alt = idx % 2 === 1;
    
    // FIX: Pass both ins and s.floor_level — ins.floor_level (joined from plans)
    // takes priority; s.floor_level is the fallback for single-plan sessions
    // where the join may not have been included.
    const displayName = getElementDisplayName(ins, s.floor_level);
    
    const labelText = ins.label || '—';
    
    dataRows.push(new TableRow({
      children: [
        dCell(displayName,                      DET_COLS[0], { alt, bold: true }),
        dCell(labelText,                        DET_COLS[1], { alt }),
        dCell((ins.result ?? '').toUpperCase(), DET_COLS[2], { alt, bold: true, color: resultColor(ins.result) }),
        dCell(fmtTime(ins.inspected_at),        DET_COLS[3], { alt }),
        dCell(ins.inspector_notes,              DET_COLS[4], { alt }),
      ],
    }));
    
    // NEW: Add photo if exists
    if (ins.photo_url) {
      try {
        const imageBuffer = await fetchImageBuffer(ins.photo_url);
        
        if (imageBuffer) {
          const photoCell = new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnSpan: 5,
            margins: {
              top:    convertInchesToTwip(0.1),
              bottom: convertInchesToTwip(0.1),
              left:   convertInchesToTwip(0.1),
              right:  convertInchesToTwip(0.1),
            },
            shading: { fill: alt ? 'F8FAFC' : 'FFFFFF' },
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: imageBuffer,
                    transformation: { width: 400, height: 300 },
                  }),
                ],
              }),
            ],
          });
          
          dataRows.push(new TableRow({ children: [photoCell] }));
          logger('✅ Added photo to report:', ins.asset_id);
        } else {
          const placeholderCell = new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnSpan: 5,
            margins: {
              top:    convertInchesToTwip(0.05),
              bottom: convertInchesToTwip(0.05),
              left:   convertInchesToTwip(0.1),
              right:  convertInchesToTwip(0.1),
            },
            shading: { fill: alt ? 'F8FAFC' : 'FFFFFF' },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: '[Photo unavailable]',
                    italics: true, color: '9CA3AF', font: 'Arial', size: 18,
                  }),
                ],
              }),
            ],
          });
          
          dataRows.push(new TableRow({ children: [placeholderCell] }));
          logger('⚠️ Photo unavailable:', ins.asset_id, ins.photo_url);
        }
      } catch (err) {
        logger('❌ Error adding photo:', err.message, ins.photo_url);
      }
    }
  }

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
      // async to support photo fetching
      for (let i = 0; i < sessions.length; i++) {
        const sessionChildren = await buildDetailedSession(sessions[i], i === 0);
        children.push(...sessionChildren);
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
