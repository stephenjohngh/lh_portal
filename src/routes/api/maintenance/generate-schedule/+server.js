// src/routes/api/maintenance/generate-schedule/+server.js
// Generate a Word document listing all maintenance jobs.
//
// POST body: { jobs, building, generatedAt }
//   jobs:        maintenance_jobs[] enriched with .rag
//   building:    string
//   generatedAt: string (e.g. "21 Apr 2026")

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow,
  PageBreak, HeadingLevel,
  WidthType, TableLayoutType
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import { fmtToday } from '$lib/utils/dates';
import {
  CONTENT_W, COLOURS, BORDERS,
  hCell, dCell, run, para,
  makeHeader, makeFooter,
  DOC_STYLES, pageProps
} from '$lib/server/docxHelpers.js';

const logger = getLogger('maintenance:generate-schedule');

const RAG_COLOUR = {
  overdue:     COLOURS.failRed,
  due_soon:    COLOURS.warnAmber,
  in_progress: '3B82F6',
  scheduled:   COLOURS.passGreen,
  completed:   '6B7280',
  cancelled:   '9CA3AF',
};
const RAG_LABEL = {
  overdue: 'Overdue', due_soon: 'Due Soon', in_progress: 'In Progress',
  scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled',
};
const RESULT_COLOUR = { pass: COLOURS.passGreen, fail: COLOURS.failRed, partial: COLOURS.warnAmber, n_a: '9CA3AF' };
const RESULT_LABEL  = { pass: 'Pass', fail: 'Fail', partial: 'Partial', n_a: 'N/A' };

// -- Summary table: Scope | Overdue | Due Soon | Scheduled | Completed | Cancelled | Total --
const SM = [3000, 1100, 1200, 1400, 1200, 1100, 1466];  // sum = 10466

function buildSummaryTable(jobs) {
  const map = {};
  for (const j of jobs) {
    const key = j.scope_label || 'Building-wide';
    if (!map[key]) map[key] = { label: key, overdue: 0, due_soon: 0, in_progress: 0, scheduled: 0, completed: 0, cancelled: 0 };
    const r = j.rag ?? 'scheduled';
    if (r in map[key]) map[key][r]++;
  }
  const rows = Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
  if (!rows.length) return null;

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('Scope',     SM[0]),
      hCell('Overdue',   SM[1], { fill: '5c1a1a' }),
      hCell('Due Soon',  SM[2], { fill: '5c3a0a' }),
      hCell('Scheduled', SM[3], { fill: '1a4a2a' }),
      hCell('Completed', SM[4]),
      hCell('Cancelled', SM[5]),
      hCell('Total',     SM[6]),
    ],
  });

  const totals = { overdue: 0, due_soon: 0, scheduled: 0, completed: 0, cancelled: 0 };

  const dataRows = rows.map((r, idx) => {
    const alt   = idx % 2 === 1;
    const total = r.overdue + r.due_soon + r.in_progress + r.scheduled + r.completed + r.cancelled;
    totals.overdue    += r.overdue;
    totals.due_soon   += r.due_soon;
    totals.scheduled  += r.scheduled + r.in_progress;
    totals.completed  += r.completed;
    totals.cancelled  += r.cancelled;
    return new TableRow({
      children: [
        dCell(r.label,                   SM[0], { alt }),
        dCell(String(r.overdue  || '—'), SM[1], { alt, bold: r.overdue  > 0, color: r.overdue  > 0 ? COLOURS.failRed  : undefined }),
        dCell(String(r.due_soon || '—'), SM[2], { alt, bold: r.due_soon > 0, color: r.due_soon > 0 ? COLOURS.warnAmber : undefined }),
        dCell(String((r.scheduled + r.in_progress) || '—'), SM[3], { alt }),
        dCell(String(r.completed || '—'), SM[4], { alt }),
        dCell(String(r.cancelled || '—'), SM[5], { alt }),
        dCell(String(total),              SM[6], { alt, bold: true }),
      ],
    });
  });

  const grandTotal = totals.overdue + totals.due_soon + totals.scheduled + totals.completed + totals.cancelled;
  const totalRow = new TableRow({
    children: [
      hCell('TOTAL',                          SM[0]),
      hCell(String(totals.overdue),           SM[1], { fill: totals.overdue  > 0 ? '5c1a1a' : COLOURS.headerFill }),
      hCell(String(totals.due_soon),          SM[2], { fill: totals.due_soon > 0 ? '5c3a0a' : COLOURS.headerFill }),
      hCell(String(totals.scheduled),         SM[3], { fill: '1a4a2a' }),
      hCell(String(totals.completed),         SM[4]),
      hCell(String(totals.cancelled),         SM[5]),
      hCell(String(grandTotal),               SM[6]),
    ],
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: SM,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows, totalRow],
  });
}

// -- Jobs detail table: Date | Title | Scope | Status | Result | Contractor | Ref --
const JT = [900, 2500, 2100, 1100, 850, 1550, 1466];  // sum = 10466

function buildJobTable(jobs) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('Date',       JT[0]),
      hCell('Title',      JT[1]),
      hCell('Scope',      JT[2]),
      hCell('Status',     JT[3]),
      hCell('Result',     JT[4]),
      hCell('Contractor', JT[5]),
      hCell('Reference',  JT[6]),
    ],
  });

  const dataRows = jobs.map((j, idx) => {
    const alt    = idx % 2 === 1;
    const ragCol = RAG_COLOUR[j.rag]    ?? COLOURS.textDark;
    const ragLbl = RAG_LABEL[j.rag]     ?? '';
    const resCol = j.result ? (RESULT_COLOUR[j.result] ?? COLOURS.textMuted) : undefined;
    const resLbl = j.result ? (RESULT_LABEL[j.result]  ?? j.result) : '—';
    const dateStr = j.completed_date ?? j.scheduled_date ?? '—';
    return new TableRow({
      children: [
        dCell(dateStr,                   JT[0], { alt, size: 16 }),
        dCell(j.title ?? '—',           JT[1], { alt }),
        dCell(j.scope_label ?? '—',     JT[2], { alt, size: 16 }),
        dCell(ragLbl,                   JT[3], { alt, bold: true, color: ragCol, size: 16 }),
        dCell(resLbl,                   JT[4], { alt, bold: !!j.result, color: resCol, size: 16 }),
        dCell(j.contractor_name ?? '—', JT[5], { alt, size: 16 }),
        dCell(j.reference_number ?? '—', JT[6], { alt, size: 16 }),
      ],
    });
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: JT,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows],
  });
}

// -- POST handler --------------------------------------------------------------
export async function POST({ request }) {
  logger('📄 POST /api/maintenance/generate-schedule');
  try {
    const body = await request.json();
    const { jobs = [], building = 'Lonsdale House', generatedAt = '' } = body;

    const genAt    = generatedAt || fmtToday();
    const docTitle = `${building} — Maintenance Schedule`;

    const ragOrder = { overdue: 0, due_soon: 1, in_progress: 2, scheduled: 3, completed: 4, cancelled: 5 };
    const sorted   = [...jobs].sort((a, b) =>
      ((ragOrder[a.rag] ?? 9) - (ragOrder[b.rag] ?? 9)) ||
      (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '')
    );

    const SECTIONS = [
      { label: 'Overdue',    colour: COLOURS.failRed,   filter: j => j.rag === 'overdue'     },
      { label: 'Due Soon',   colour: COLOURS.warnAmber, filter: j => j.rag === 'due_soon'     },
      { label: 'Scheduled',  colour: COLOURS.passGreen, filter: j => j.rag === 'scheduled' || j.rag === 'in_progress' },
      { label: 'Completed',  colour: '6B7280',          filter: j => j.rag === 'completed'    },
      { label: 'Cancelled',  colour: '9CA3AF',          filter: j => j.rag === 'cancelled'    },
    ];

    const children = [];

    // Document title
    children.push(new Paragraph({
      heading:  HeadingLevel.HEADING_1,
      spacing:  { before: 0, after: 200 },
      children: [run(docTitle, { size: 36, bold: true, color: COLOURS.textDark })],
    }));
    children.push(para([
      run(`Generated: ${genAt}`, { size: 18, color: COLOURS.textMuted }),
      new TextRun({ text: '   ', font: 'Arial' }),
      run(`Total: ${jobs.length} job${jobs.length === 1 ? '' : 's'}`, { size: 18, color: COLOURS.textMuted }),
    ], { after: 320 }));

    // Summary pivot
    if (jobs.length > 0) {
      children.push(para('Summary', { bold: true, size: 22, before: 0, after: 120 }));
      const t = buildSummaryTable(jobs);
      if (t) {
        children.push(t);
        children.push(new Paragraph({ spacing: { after: 400 }, children: [] }));
      }
    }

    // Per-RAG detail tables
    let first = true;
    for (const sec of SECTIONS) {
      const secJobs = sorted.filter(sec.filter);
      if (!secJobs.length) continue;
      if (!first) children.push(new Paragraph({ children: [new PageBreak()] }));
      first = false;

      children.push(new Paragraph({
        heading:  HeadingLevel.HEADING_2,
        spacing:  { before: 0, after: 160 },
        children: [run(`${sec.label}  (${secJobs.length})`, { size: 26, bold: true, color: sec.colour })],
      }));
      children.push(buildJobTable(secJobs));
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    }

    if (!jobs.length) {
      children.push(para('No maintenance jobs found.', { italics: true, color: COLOURS.textMuted }));
    }

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
    logger('✅ Schedule report generated:', buffer.byteLength, 'bytes');

    const dateSlug = new Date().toISOString().slice(0, 10);
    return new Response(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Maintenance_Schedule_${dateSlug}.docx"`,
      },
    });

  } catch (err) {
    logger('❌ Error:', err.message, err.stack?.slice(0, 300));
    return json({ error: err.message }, { status: 500 });
  }
}
