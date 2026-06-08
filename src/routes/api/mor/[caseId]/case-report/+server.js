// src/routes/api/mor/[caseId]/case-report/+server.js
// Phase 3a — per-case Word export. Returns a single .docx containing the
// full case record: header + case details + triage + decision + BSR refs
// + mitigations + reporter contacts + full timeline + attachments list +
// lessons learned. Designed to be the canonical "send this to the regulator
// / auditor / solicitor" document.
//
// Auth: requireAuth + MOR app access. Service role bypasses RLS so the
// endpoint can fetch joined profiles without per-row permission shuffling.
//
// POST /api/mor/<caseId>/case-report
// Body: ignored (kept POST for parity with the rest of the docx endpoints).

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, TextRun, HeadingLevel,
  Table, TableRow,
  WidthType, TableLayoutType,
  BorderStyle, AlignmentType,
} from 'docx';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }       from '$env/static/public';
import { env } from '$env/dynamic/private';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger }   from '$lib/utils/logger';
import {
  CONTENT_W, COLOURS, BORDERS,
  hCell, dCell, run, para,
  makeHeader, makeFooter,
  DOC_STYLES, pageProps,
} from '$lib/server/docxHelpers.js';
import { fmtDateLong, fmtDateTime, fmtGenerated } from '$lib/utils/dates';
import {
  STATUS_LABEL, MECHANISM_LABEL, CHANNEL_LABEL, REPORTER_TYPE_LABEL,
  DECISION_LABEL, TRIAGE_LABEL,
  ENTRY_TYPE_LABEL, CONTACT_KIND_LABEL,
} from '$lib/apps/mor/utils/morHelpers';

const logger = getLogger('mor/case-report');

let _svc = null;
function getSvc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return _svc;
}

// ── Table layouts ────────────────────────────────────────────────────────────
const DET_L = 2400;
const DET_V = CONTENT_W - DET_L;

function detRow(label, value, alt = false) {
  return new TableRow({
    children: [
      dCell(label,         DET_L, { alt, bold: true, size: 17, color: '6B7280' }),
      dCell(value || '—',  DET_V, { alt }),
    ],
  });
}

function detailTable(rows) {
  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: [DET_L, DET_V],
    borders:      BORDERS,
    rows:         rows.map((r, i) => detRow(r[0], r[1], i % 2 === 1)),
  });
}

// Mitigations table column widths
const MIT_W = [1500, 5000, 1800, 1500, CONTENT_W - 9800];
function mitigationsTable(mits) {
  if (!mits?.length) return null;
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Type',        MIT_W[0]),
      hCell('Description', MIT_W[1]),
      hCell('Owner',       MIT_W[2]),
      hCell('Target',      MIT_W[3]),
      hCell('Status',      MIT_W[4]),
    ],
  });
  const rows = mits.map((m, i) => new TableRow({
    children: [
      dCell(m.type === 'interim' ? 'Interim' : 'Permanent', MIT_W[0], { alt: i % 2 === 1, size: 16 }),
      dCell(m.description ?? '—',                            MIT_W[1], { alt: i % 2 === 1 }),
      dCell(m.owner       ?? '—',                            MIT_W[2], { alt: i % 2 === 1, size: 16 }),
      dCell(m.target_date ?? '—',                            MIT_W[3], { alt: i % 2 === 1, size: 16 }),
      dCell(m.status?.replace('_', ' ') ?? '—',              MIT_W[4], { alt: i % 2 === 1, size: 16,
                                                                          color: m.status === 'complete' ? COLOURS.passGreen
                                                                              : m.status === 'in_progress' ? COLOURS.warnAmber
                                                                              : undefined }),
    ],
  }));
  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: MIT_W,
    borders:      BORDERS,
    rows:         [header, ...rows],
  });
}

// Timeline table column widths
const TL_W = [2200, 2000, 5400, CONTENT_W - 9600];
function timelineTable(entries) {
  if (!entries?.length) return null;
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Date',    TL_W[0]),
      hCell('Type',    TL_W[1]),
      hCell('Content', TL_W[2]),
      hCell('Author',  TL_W[3]),
    ],
  });
  const rows = entries.map((e, i) => {
    const typeLabel = e.entry_type === 'reporter_contact' && e.contact_kind
      ? CONTACT_KIND_LABEL[e.contact_kind] ?? ENTRY_TYPE_LABEL[e.entry_type] ?? e.entry_type
      : ENTRY_TYPE_LABEL[e.entry_type] ?? e.entry_type;
    return new TableRow({
      children: [
        dCell(fmtDateTime(e.created_at),     TL_W[0], { alt: i % 2 === 1, size: 15 }),
        dCell(typeLabel,                     TL_W[1], { alt: i % 2 === 1, size: 15, bold: true }),
        dCell(e.content ?? '—',              TL_W[2], { alt: i % 2 === 1, size: 16 }),
        dCell(e.author_name ?? 'Unknown',    TL_W[3], { alt: i % 2 === 1, size: 15 }),
      ],
    });
  });
  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: TL_W,
    borders:      BORDERS,
    rows:         [header, ...rows],
  });
}

// Attachments table
const ATT_W = [4800, 1800, 1200, CONTENT_W - 7800];
function attachmentsTable(items) {
  if (!items?.length) return null;
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Filename', ATT_W[0]),
      hCell('MIME',     ATT_W[1]),
      hCell('Size',     ATT_W[2]),
      hCell('Storage',  ATT_W[3]),
    ],
  });
  const rows = items.map((a, i) => new TableRow({
    children: [
      dCell(a.filename || '(unnamed)',                ATT_W[0], { alt: i % 2 === 1, size: 16 }),
      dCell(a.mime_type ?? '—',                       ATT_W[1], { alt: i % 2 === 1, size: 15 }),
      dCell(a.size_bytes ? `${Math.round(a.size_bytes / 1024)} KB` : '—',
                                                      ATT_W[2], { alt: i % 2 === 1, size: 15 }),
      dCell(a.storage_provider ?? '—',                ATT_W[3], { alt: i % 2 === 1, size: 15 }),
    ],
  }));
  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: ATT_W,
    borders:      BORDERS,
    rows:         [header, ...rows],
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function POST({ params, request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const svc = getSvc();

  // Case + joined profiles for attribution.
  const { data: c, error: cErr } = await svc
    .from('mor_cases')
    .select(`
      *,
      created_by_profile:profiles!created_by(full_name),
      updated_by_profile:profiles!updated_by(full_name),
      triage_by_profile:profiles!triage_by(full_name),
      decision_proposed_by_profile:profiles!decision_proposed_by(full_name),
      decision_approved_by_profile:profiles!decision_approved_by(full_name),
      bsr_notice_by_profile:profiles!bsr_notice_submitted_by(full_name),
      bsr_report_by_profile:profiles!bsr_report_submitted_by(full_name)
    `)
    .eq('id', params.caseId)
    .maybeSingle();

  if (cErr) {
    logger('❌ case fetch:', cErr.message);
    return json({ error: 'Could not load case.' }, { status: 500 });
  }
  if (!c) return json({ error: 'Case not found.' }, { status: 404 });

  // Timeline (chronological)
  const { data: timeline = [] } = await svc
    .from('mor_timeline_entries')
    .select('*')
    .eq('case_id', c.id)
    .order('created_at', { ascending: true });

  // Mitigations
  const { data: mitigations = [] } = await svc
    .from('mor_mitigations')
    .select('*')
    .eq('case_id', c.id)
    .order('created_at', { ascending: true });

  // Media attachments
  const { data: media = [] } = await svc
    .from('media_attachments')
    .select('id, filename, mime_type, size_bytes, storage_url, storage_provider, created_at')
    .eq('entity_type', 'mor_case')
    .eq('entity_id', c.id)
    .order('created_at', { ascending: true });

  // ── Build the document ────────────────────────────────────────────────
  const docTitle = `MOR Case Record — ${c.reference}`;
  const children = [];

  // Title block
  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 80 },
    children: [run(docTitle, { size: 36, bold: true, color: COLOURS.textDark })],
  }));
  if (c.urgency) {
    children.push(para('⚠ URGENT', { bold: true, size: 22, color: COLOURS.failRed, after: 200 }));
  }
  children.push(para(c.description ?? '', { size: 20, after: 280 }));

  // Status banner
  children.push(new Paragraph({
    spacing: { before: 0, after: 240 },
    border:  { top:    { style: BorderStyle.SINGLE, size: 4, color: COLOURS.border, space: 6 },
               bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOURS.border, space: 6 } },
    children: [
      run('Current status:  ', { bold: true, size: 20 }),
      run(STATUS_LABEL[c.status] ?? c.status, { size: 22, bold: true, color: COLOURS.subheading }),
    ],
  }));

  // Case details
  children.push(para('Case details', { bold: true, size: 24, before: 0, after: 100 }));
  const reporterDisplay = c.is_anonymous
    ? 'Anonymous'
    : `${REPORTER_TYPE_LABEL[c.reporter_type] ?? c.reporter_type ?? '—'}` +
      (c.reporter_name    ? ` · ${c.reporter_name}` : '') +
      (c.reporter_contact ? ` · ${c.reporter_contact}` : '');
  children.push(detailTable([
    ['Reference',           c.reference],
    ['Identification date', fmtDateTime(c.identification_date)],
    ['Received',            fmtDateTime(c.received_date)],
    ['Mechanism',           MECHANISM_LABEL[c.mechanism] ?? c.mechanism ?? '—'],
    ['Location',            c.location_text ?? '—'],
    ['Channel',             CHANNEL_LABEL[c.channel] ?? c.channel ?? '—'],
    ['Reporter',            reporterDisplay],
    ['Logged by',           `${c.created_by_profile?.full_name ?? 'Unknown'} · ${fmtDateTime(c.created_at)}`],
    ['Last updated',        `${c.updated_by_profile?.full_name ?? 'Unknown'} · ${fmtDateTime(c.updated_at)}`],
  ]));
  children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));

  // Triage
  if (c.triage_outcome) {
    children.push(para('Triage', { bold: true, size: 24, before: 100, after: 100 }));
    children.push(detailTable([
      ['Outcome',    TRIAGE_LABEL[c.triage_outcome] ?? c.triage_outcome],
      ['By',         c.triage_by_profile?.full_name ?? 'Unknown'],
      ['Recorded',   fmtDateTime(c.triaged_at)],
      ['Rationale',  c.triage_rationale ?? '—'],
    ]));
    children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
  }

  // Decision
  if (c.decision_outcome) {
    children.push(para('Decision', { bold: true, size: 24, before: 100, after: 100 }));
    children.push(detailTable([
      ['Outcome',     DECISION_LABEL[c.decision_outcome] ?? c.decision_outcome],
      ['Proposed by', c.decision_proposed_by_profile?.full_name ?? 'Unknown'],
      ['Approved by', c.decision_approved_by_profile?.full_name ?? '— (not yet approved)'],
      ['Decided at',  c.decision_at ? fmtDateTime(c.decision_at) : '—'],
      ['Rationale',   c.decision_rationale ?? '—'],
    ]));
    children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
  }

  // BSR submissions
  if (c.bsr_notice_ref || c.bsr_report_ref) {
    children.push(para('BSR submissions', { bold: true, size: 24, before: 100, after: 100 }));
    const rows = [];
    if (c.bsr_notice_ref) {
      rows.push(['BSR notice reference',  c.bsr_notice_ref]);
      rows.push(['Notice submitted at',   fmtDateTime(c.bsr_notice_submitted_at)]);
      rows.push(['Notice submitted by',   c.bsr_notice_by_profile?.full_name ?? 'Unknown']);
      if (c.bsr_notice_notes) rows.push(['Notice notes', c.bsr_notice_notes]);
    }
    if (c.bsr_report_ref) {
      rows.push(['BSR report reference',  c.bsr_report_ref]);
      rows.push(['Report submitted at',   fmtDateTime(c.bsr_report_submitted_at)]);
      rows.push(['Report submitted by',   c.bsr_report_by_profile?.full_name ?? 'Unknown']);
      if (c.bsr_report_notes) rows.push(['Report notes', c.bsr_report_notes]);
    }
    children.push(detailTable(rows));
    children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
  }

  // Mitigations
  if (mitigations.length) {
    children.push(para(`Mitigations  (${mitigations.length})`, { bold: true, size: 24, before: 100, after: 100 }));
    children.push(mitigationsTable(mitigations));
    children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
  }

  // Reporter contacts (extracted from timeline for emphasis)
  const reporterContacts = timeline.filter(t => t.entry_type === 'reporter_contact');
  if (reporterContacts.length) {
    children.push(para(`Reporter contact log  (${reporterContacts.length})`, { bold: true, size: 24, before: 100, after: 100 }));
    children.push(timelineTable(reporterContacts));
    children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
  }

  // Full timeline
  if (timeline.length) {
    children.push(para(`Full timeline  (${timeline.length} entries)`, { bold: true, size: 24, before: 100, after: 100 }));
    children.push(timelineTable(timeline));
    children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
  }

  // Attachments
  if (media.length) {
    children.push(para(`Attachments  (${media.length})`, { bold: true, size: 24, before: 100, after: 100 }));
    children.push(attachmentsTable(media));
    children.push(para('Files are stored externally — URLs are held in the portal and were excluded from this document.', { size: 14, italics: true, color: COLOURS.textMuted, after: 240 }));
  }

  // Lessons learned
  if (c.lessons_learned) {
    children.push(para('Lessons learned', { bold: true, size: 24, before: 100, after: 100 }));
    children.push(para(c.lessons_learned, { size: 20, after: 240 }));
  }

  // Footer note
  children.push(new Paragraph({ spacing: { before: 400, after: 0 }, children: [] }));
  children.push(para(`Generated ${fmtGenerated()} from the LH Portal MOR app.`,
    { size: 14, italics: true, color: COLOURS.textMuted, align: AlignmentType.RIGHT }));

  // ── Pack and stream ───────────────────────────────────────────────────
  const doc = new Document({
    styles:   DOC_STYLES,
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader(docTitle, fmtGenerated()) },
      footers: { default: makeFooter() },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `${c.reference}-case-record.docx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
