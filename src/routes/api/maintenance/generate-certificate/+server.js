// src/routes/api/maintenance/generate-certificate/+server.js
// Generate a completion certificate Word document for a single maintenance job.
//
// POST body: { job, jobComponents, docs, regime, building, generatedAt }
//   job:           maintenance_jobs row enriched with .rag
//   jobComponents: maintenance_job_components[] with embedded .component
//   docs:          maintenance_documents[] for this job
//   regime:        maintenance_regime row (or null)
//   building:      string
//   generatedAt:   string

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun,
  Table, TableRow,
  HeadingLevel,
  WidthType, AlignmentType, TableLayoutType,
  BorderStyle
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  CONTENT_W, COLOURS, BORDERS, CELL_PAD,
  hCell, dCell, run, para,
  makeHeader, makeFooter,
  DOC_STYLES, pageProps
} from '$lib/server/docxHelpers.js';

const logger = getLogger('maintenance:generate-certificate');

const RESULT_LABEL  = { pass: 'Pass ✓', fail: 'Fail ✗', partial: 'Partial ~', n_a: 'N/A' };
const RESULT_COLOUR = { pass: COLOURS.passGreen, fail: COLOURS.failRed, partial: COLOURS.warnAmber, n_a: '9CA3AF' };
const SCOPE_LABEL   = { building: 'Building-wide', system: 'System', type: 'Type', component: 'Component' };
const DOC_TYPE_LABEL = { certificate: 'Certificate', report: 'Report', photo: 'Photo', invoice: 'Invoice', other: 'Other' };

function fmtDateStr(d) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

// -- Detail block: two-column label/value rows ---------------------------------
// Half CONTENT_W each
const DET_L = 2200;
const DET_V = CONTENT_W - DET_L;

function detRow(label, value, alt = false) {
  return new TableRow({
    children: [
      dCell(label, DET_L, { alt, bold: true, size: 17, color: '6B7280' }),
      dCell(value || '—', DET_V, { alt }),
    ],
  });
}

function buildDetailTable(rows) {
  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: [DET_L, DET_V],
    borders:      BORDERS,
    rows:         rows.map((r, i) => detRow(r[0], r[1], i % 2 === 1)),
  });
}

// -- Per-component results table -----------------------------------------------
const PC = [1200, 3800, 1000, CONTENT_W - 6000];  // ID | Label | Result | Notes

function buildComponentTable(components) {
  if (!components?.length) return null;

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('ID',     PC[0]),
      hCell('Component', PC[1]),
      hCell('Result', PC[2]),
      hCell('Notes',  PC[3]),
    ],
  });

  const dataRows = components.map((c, idx) => {
    const alt       = idx % 2 === 1;
    const resultLbl = c.result ? (RESULT_LABEL[c.result]  ?? c.result) : '—';
    const resultCol = c.result ? (RESULT_COLOUR[c.result] ?? COLOURS.textDark) : undefined;
    return new TableRow({
      children: [
        dCell(c.component?.asset_id ?? '—', PC[0], { alt, size: 16 }),
        dCell(c.component?.label || c.component?.name || '—', PC[1], { alt }),
        dCell(resultLbl, PC[2], { alt, bold: !!c.result, color: resultCol, size: 16 }),
        dCell(c.notes || '—', PC[3], { alt, size: 16 }),
      ],
    });
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: PC,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows],
  });
}

// -- Documents list ------------------------------------------------------------
const DC = [1200, 3400, 1400, 1000, CONTENT_W - 7000];  // Type | Filename | Expiry | Size | —

function buildDocTable(docs) {
  if (!docs?.length) return null;

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('Type',     DC[0]),
      hCell('Filename', DC[1]),
      hCell('Expiry',   DC[2]),
      hCell('Size',     DC[3]),
      hCell('',         DC[4]),
    ],
  });

  const dataRows = docs.map((d, idx) => {
    const alt     = idx % 2 === 1;
    const typeLbl = DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type ?? '—';
    const sizeKb  = d.file_size ? `${Math.round(d.file_size / 1024)} KB` : '—';
    return new TableRow({
      children: [
        dCell(typeLbl,             DC[0], { alt, size: 16 }),
        dCell(d.filename ?? '—',  DC[1], { alt }),
        dCell(fmtDateStr(d.expiry_date), DC[2], { alt, size: 16 }),
        dCell(sizeKb,              DC[3], { alt, size: 16 }),
        dCell('',                  DC[4], { alt }),
      ],
    });
  });

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: DC,
    borders:      BORDERS,
    rows:         [headerRow, ...dataRows],
  });
}

// -- POST handler --------------------------------------------------------------
export async function POST({ request }) {
  logger('📄 POST /api/maintenance/generate-certificate');
  try {
    const body = await request.json();
    const {
      job, jobComponents = [], docs = [], regime = null,
      building = 'Lonsdale House', generatedAt = '',
    } = body;

    if (!job) return json({ error: 'No job data supplied.' }, { status: 400 });

    const genAt    = generatedAt || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const docTitle = `${building} — Maintenance Completion Certificate`;
    const resultLbl = job.result ? (RESULT_LABEL[job.result] ?? job.result) : 'Not recorded';
    const resultCol = job.result ? (RESULT_COLOUR[job.result] ?? COLOURS.textDark) : COLOURS.textMuted;

    const children = [];

    // Document title
    children.push(new Paragraph({
      heading:  HeadingLevel.HEADING_1,
      spacing:  { before: 0, after: 80 },
      children: [run(docTitle, { size: 36, bold: true, color: COLOURS.textDark })],
    }));
    children.push(para(job.title ?? '—', { bold: true, size: 28, color: COLOURS.subheading, after: 300 }));

    // Result banner
    children.push(new Paragraph({
      spacing:  { before: 0, after: 320 },
      children: [run(resultLbl, { size: 32, bold: true, color: resultCol })],
    }));

    // Job detail table
    const scopeLabel = `${SCOPE_LABEL[job.scope_type] ?? job.scope_type}: ${job.scope_label ?? '—'}`;
    const detailRows = [
      ['Scope',                scopeLabel],
      ['Scheduled date',       fmtDateStr(job.scheduled_date)],
      ['Completed date',       fmtDateStr(job.completed_date)],
      ['Contractor',           job.contractor_name ?? '—'],
      ['Engineer',             job.engineer_name   ?? '—'],
      ['Reference / cert no.', job.reference_number ?? '—'],
    ];
    if (regime) {
      detailRows.push(['Regime task', regime.task_name]);
    }

    children.push(para('Job details', { bold: true, size: 22, before: 0, after: 120 }));
    children.push(buildDetailTable(detailRows));
    children.push(new Paragraph({ spacing: { after: 300 }, children: [] }));

    // Completion notes
    if (job.completion_notes) {
      children.push(para('Completion notes', { bold: true, size: 20, before: 0, after: 80 }));
      children.push(para(job.completion_notes, { size: 18, after: 300 }));
    }

    // Per-component results
    if (jobComponents.length > 0) {
      children.push(para(`Per-component results  (${jobComponents.length})`, { bold: true, size: 20, before: 200, after: 120 }));
      const compTable = buildComponentTable(jobComponents);
      if (compTable) {
        children.push(compTable);
        children.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
      }
    }

    // Documents
    if (docs.length > 0) {
      children.push(para(`Attached documents  (${docs.length})`, { bold: true, size: 20, before: 200, after: 120 }));
      const docTable = buildDocTable(docs);
      if (docTable) {
        children.push(docTable);
        children.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
      }
    }

    // Signature block
    children.push(new Paragraph({ spacing: { after: 600 }, children: [] }));
    children.push(new Paragraph({
      spacing: { before: 0, after: 0 },
      border:  { top: { style: BorderStyle.SINGLE, size: 4, color: COLOURS.border, space: 4 } },
      children: [],
    }));
    children.push(para([
      run('Authorised by:  ', { bold: true, size: 18 }),
      run('_____________________________', { size: 18, color: COLOURS.textMuted }),
      new TextRun({ text: '          ', font: 'Arial' }),
      run('Date:  ', { bold: true, size: 18 }),
      run('__________________', { size: 18, color: COLOURS.textMuted }),
    ], { before: 80, after: 0 }));

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
    logger('✅ Certificate generated:', buffer.byteLength, 'bytes');

    const safe     = (job.title ?? 'job').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    const dateSlug = new Date().toISOString().slice(0, 10);
    return new Response(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Maintenance_Certificate_${safe}_${dateSlug}.docx"`,
      },
    });

  } catch (err) {
    logger('❌ Error:', err.message, err.stack?.slice(0, 300));
    return json({ error: err.message }, { status: 500 });
  }
}
