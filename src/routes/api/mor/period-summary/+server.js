// src/routes/api/mor/period-summary/+server.js
// Phase 3a — period summary report. Returns a Word document summarising
// MOR activity over a date range — open at start / new submissions /
// closures by outcome / BSR submissions / 10-day compliance / triage
// outcome split / decision outcome split / time-to-X averages / lessons
// learned listing / per-case summary table.
//
// POST /api/mor/period-summary
// Body: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
//
// Auth: requireAuth + MOR app access (any signed-in MOR user can pull a
// summary report; the data they see is already what they can see in the UI).

import { json } from '@sveltejs/kit';
import {
  Document, Packer,
  Paragraph, HeadingLevel,
  Table, TableRow,
  WidthType, TableLayoutType,
  AlignmentType,
} from 'docx';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }       from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger }   from '$lib/utils/logger';
import {
  CONTENT_W, COLOURS, BORDERS,
  hCell, dCell, run, para,
  makeHeader, makeFooter,
  DOC_STYLES, pageProps,
} from '$lib/server/docxHelpers.js';
import { fmtDateLong, fmtGenerated } from '$lib/utils/dates';
import {
  STATUS_LABEL, OPEN_STATUSES, STATUS_ORDER,
  TRIAGE_LABEL, DECISION_LABEL,
  CHANNEL_LABEL, MECHANISM_LABEL,
} from '$lib/apps/mor/utils/morHelpers';

const logger = getLogger('mor/period-summary');

let _svc = null;
function getSvc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return _svc;
}

const OPEN_SET = new Set(OPEN_STATUSES);
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Stat helpers ─────────────────────────────────────────────────────────────

function diffHours(later, earlier) {
  if (!later || !earlier) return null;
  const ms = new Date(later) - new Date(earlier);
  return Number.isFinite(ms) ? ms / (60 * 60 * 1000) : null;
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function fmtHours(h) {
  if (h == null) return '—';
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

// ── Tables ───────────────────────────────────────────────────────────────────

const KV_L = 4200;
const KV_V = CONTENT_W - KV_L;
function kvRow(label, value, alt = false) {
  return new TableRow({
    children: [
      dCell(label,        KV_L, { alt, bold: true, size: 17, color: '6B7280' }),
      dCell(value ?? '—', KV_V, { alt, size: 18 }),
    ],
  });
}
function kvTable(rows) {
  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: [KV_L, KV_V],
    borders:      BORDERS,
    rows:         rows.map((r, i) => kvRow(r[0], r[1], i % 2 === 1)),
  });
}

const CASE_W = [1700, 1500, 5000, 1300, CONTENT_W - 9500];
function caseSummaryTable(rows) {
  if (!rows.length) return null;
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Reference',      CASE_W[0]),
      hCell('Status',         CASE_W[1]),
      hCell('Description',    CASE_W[2]),
      hCell('Identified',     CASE_W[3]),
      hCell('Outcome / next', CASE_W[4]),
    ],
  });
  const body = rows.map((c, i) => new TableRow({
    children: [
      dCell(c.reference,                       CASE_W[0], { alt: i % 2 === 1, size: 16, bold: true }),
      dCell(STATUS_LABEL[c.status] ?? c.status, CASE_W[1], { alt: i % 2 === 1, size: 15 }),
      dCell(c.description ?? '—',              CASE_W[2], { alt: i % 2 === 1, size: 15 }),
      dCell(c.identification_date?.slice(0, 10) ?? '—',
                                              CASE_W[3], { alt: i % 2 === 1, size: 15 }),
      dCell(c._outcomeNote,                    CASE_W[4], { alt: i % 2 === 1, size: 15 }),
    ],
  }));
  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths: CASE_W,
    borders:      BORDERS,
    rows:         [header, ...body],
  });
}

function outcomeNote(c) {
  if (c.status === 'closed' && c.decision_outcome === 'bsr' && c.bsr_report_ref) {
    return `Closed · reported to BSR (${c.bsr_report_ref})`;
  }
  if (c.status === 'closed') return 'Closed';
  if (c.status === 'reclassified') return 'Not proceeded as MOR';
  if (c.status === 'bsr_report' || c.status === 'bsr_notice') return 'On BSR track';
  if (c.status === 'in_remediation' || c.status === 'remediated') return 'In remediation';
  if (c.decision_outcome) return DECISION_LABEL[c.decision_outcome] ?? c.decision_outcome;
  return STATUS_LABEL[c.status] ?? c.status;
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const startStr = body?.start;
  const endStr   = body?.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    return json({ error: 'start and end must be YYYY-MM-DD dates.' }, { status: 400 });
  }
  if (startStr > endStr) {
    return json({ error: 'start must be on or before end.' }, { status: 400 });
  }

  const startIso = `${startStr}T00:00:00.000Z`;
  const endIso   = `${endStr}T23:59:59.999Z`;
  const startMs  = new Date(startIso).getTime();
  const endMs    = new Date(endIso).getTime();

  // ── Load everything ─────────────────────────────────────────────────────
  const svc = getSvc();

  // All cases — we need every case that was open at any point in the period.
  const { data: cases = [], error: cErr } = await svc
    .from('mor_cases')
    .select('*')
    .order('created_at', { ascending: true });
  if (cErr) {
    logger('❌ case fetch:', cErr.message);
    return json({ error: 'Could not load cases.' }, { status: 500 });
  }

  // ── Slice by period ─────────────────────────────────────────────────────
  const newInPeriod    = cases.filter(c => c.created_at >= startIso && c.created_at <= endIso);
  const closedInPeriod = cases.filter(c => c.closed_at && c.closed_at >= startIso && c.closed_at <= endIso);
  const reclassifiedInPeriod = closedInPeriod.filter(c => c.status === 'reclassified');
  const closedAsMorInPeriod  = closedInPeriod.filter(c => c.status === 'closed');

  // "Active in period" — created on or before end AND (still open OR closed within or after start)
  const activeInPeriod = cases.filter(c => {
    if (c.created_at > endIso) return false;
    if (!c.closed_at) return true; // still open
    return c.closed_at >= startIso;
  });

  // Open at start / end
  const openAtStart = cases.filter(c => {
    if (c.created_at >= startIso) return false; // created after start
    if (!c.closed_at) return true;
    return c.closed_at >= startIso; // closed within or after the period
  }).length;
  const openAtEnd = cases.filter(c => {
    if (c.created_at > endIso) return false;
    if (!c.closed_at) return true;
    return c.closed_at > endIso;
  }).length;

  // BSR submissions in period (filed timestamp in the window)
  const bsrNoticesInPeriod = cases.filter(c => c.bsr_notice_submitted_at &&
    c.bsr_notice_submitted_at >= startIso && c.bsr_notice_submitted_at <= endIso);
  const bsrReportsInPeriod = cases.filter(c => c.bsr_report_submitted_at &&
    c.bsr_report_submitted_at >= startIso && c.bsr_report_submitted_at <= endIso);

  // 10-day BSR submission compliance among reports filed in the period.
  let withinDeadline = 0;
  for (const c of bsrReportsInPeriod) {
    const ms = new Date(c.bsr_report_submitted_at) - new Date(c.identification_date);
    if (ms <= 10 * DAY_MS) withinDeadline++;
  }
  const bsrCompliancePct = bsrReportsInPeriod.length
    ? Math.round((withinDeadline / bsrReportsInPeriod.length) * 100)
    : null;

  // Time-to-X averages — computed over cases that reached the milestone within the period.
  const tta = newInPeriod
    .filter(c => c.acknowledged_at)
    .map(c => diffHours(c.acknowledged_at, c.received_date))
    .filter(x => x != null);
  const ttt = newInPeriod
    .filter(c => c.triaged_at)
    .map(c => diffHours(c.triaged_at, c.received_date))
    .filter(x => x != null);
  const ttd = newInPeriod
    .filter(c => c.decision_at)
    .map(c => diffHours(c.decision_at, c.received_date))
    .filter(x => x != null);
  const ttc = closedAsMorInPeriod
    .map(c => diffHours(c.closed_at, c.received_date))
    .filter(x => x != null);

  // Triage outcome distribution over cases triaged in the period.
  const triagedInPeriod = cases.filter(c => c.triaged_at && c.triaged_at >= startIso && c.triaged_at <= endIso);
  const triageCounts = { clearly_reportable: 0, possibly_reportable: 0, not_reportable: 0 };
  for (const c of triagedInPeriod) {
    if (c.triage_outcome) triageCounts[c.triage_outcome] = (triageCounts[c.triage_outcome] ?? 0) + 1;
  }

  // Decision outcome distribution over cases decided in the period.
  const decidedInPeriod = cases.filter(c => c.decision_at && c.decision_at >= startIso && c.decision_at <= endIso);
  const decisionCounts = { bsr: 0, internal: 0, no_action: 0 };
  for (const c of decidedInPeriod) {
    if (c.decision_outcome) decisionCounts[c.decision_outcome] = (decisionCounts[c.decision_outcome] ?? 0) + 1;
  }

  // Channel split of new submissions
  const channelCounts = {};
  for (const c of newInPeriod) {
    channelCounts[c.channel ?? 'unknown'] = (channelCounts[c.channel ?? 'unknown'] ?? 0) + 1;
  }

  // Anonymity rate of new submissions
  const anonymousNew = newInPeriod.filter(c => c.is_anonymous).length;
  const anonPct = newInPeriod.length
    ? Math.round((anonymousNew / newInPeriod.length) * 100)
    : null;

  // Urgent new submissions
  const urgentNew = newInPeriod.filter(c => c.urgency).length;

  // Status distribution at end of period
  const statusAtEnd = new Map();
  for (const c of cases) {
    if (c.created_at > endIso) continue;
    // Use the case's current status only if it didn't close after the period;
    // if it closed within the period this counts as 'closed'. If still open it
    // counts as the live status.
    const inPeriodStatus = c.closed_at && c.closed_at <= endIso ? c.status : c.status;
    if (c.closed_at && c.closed_at > endIso) continue; // closed after end → treat as out-of-scope here
    statusAtEnd.set(inPeriodStatus, (statusAtEnd.get(inPeriodStatus) ?? 0) + 1);
  }

  // Lessons learned: distinct text from cases closed in period
  const lessons = closedInPeriod
    .filter(c => c.lessons_learned && c.lessons_learned.trim().length > 0)
    .map(c => ({ ref: c.reference, closedAt: c.closed_at, text: c.lessons_learned.trim() }));

  // ── Build the document ──────────────────────────────────────────────────
  const docTitle = `MOR Activity Summary — ${fmtDateLong(startIso)} to ${fmtDateLong(endIso)}`;
  const children = [];

  children.push(new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 0, after: 80 },
    children: [run(docTitle, { size: 34, bold: true, color: COLOURS.textDark })],
  }));
  children.push(para('Lonsdale House — Mandatory Occurrence Reporting (BSA 2022 s.87)',
    { size: 20, color: COLOURS.subheading, bold: true, after: 280 }));

  // Headline numbers
  children.push(para('Headline numbers', { bold: true, size: 24, before: 0, after: 100 }));
  children.push(kvTable([
    ['Open at start of period',           String(openAtStart)],
    ['New submissions in period',         `${newInPeriod.length}` + (urgentNew > 0 ? ` (${urgentNew} urgent)` : '')],
    ['Cases closed in period',            `${closedInPeriod.length} ` +
                                          `(${closedAsMorInPeriod.length} after full workflow, ` +
                                          `${reclassifiedInPeriod.length} not proceeded as MOR)`],
    ['BSR notices submitted in period',   String(bsrNoticesInPeriod.length)],
    ['BSR reports submitted in period',   String(bsrReportsInPeriod.length)],
    ['10-day BSR submission compliance',  bsrCompliancePct == null ? '—' : `${bsrCompliancePct}% (${withinDeadline}/${bsrReportsInPeriod.length})`],
    ['Open at end of period',             String(openAtEnd)],
  ]));
  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Performance — time-to-X
  children.push(para('Performance — time to milestone', { bold: true, size: 24, before: 100, after: 100 }));
  children.push(kvTable([
    ['Mean time to acknowledge',  `${fmtHours(mean(tta))} (n=${tta.length})`],
    ['Median time to acknowledge', fmtHours(median(tta))],
    ['Mean time to triage',       `${fmtHours(mean(ttt))} (n=${ttt.length})`],
    ['Median time to triage',     fmtHours(median(ttt))],
    ['Mean time to decision',     `${fmtHours(mean(ttd))} (n=${ttd.length})`],
    ['Median time to decision',   fmtHours(median(ttd))],
    ['Mean time to close',        `${fmtHours(mean(ttc))} (n=${ttc.length})`],
    ['Median time to close',      fmtHours(median(ttc))],
  ]));
  children.push(para(
    'Counted only over cases that reached the milestone during the period. ' +
    '"n" is the sample size.',
    { size: 14, italics: true, color: COLOURS.textMuted, after: 240 },
  ));

  // Triage and decision distribution
  children.push(para('Triage outcomes (cases triaged in period)', { bold: true, size: 22, before: 100, after: 100 }));
  if (triagedInPeriod.length === 0) {
    children.push(para('No cases were triaged in this period.', { size: 18, italics: true, color: COLOURS.textMuted, after: 240 }));
  } else {
    children.push(kvTable([
      [TRIAGE_LABEL.clearly_reportable,  String(triageCounts.clearly_reportable)],
      [TRIAGE_LABEL.possibly_reportable, String(triageCounts.possibly_reportable)],
      [TRIAGE_LABEL.not_reportable,      String(triageCounts.not_reportable)],
    ]));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  children.push(para('Decision outcomes (cases decided in period)', { bold: true, size: 22, before: 100, after: 100 }));
  if (decidedInPeriod.length === 0) {
    children.push(para('No cases reached a final decision in this period.', { size: 18, italics: true, color: COLOURS.textMuted, after: 240 }));
  } else {
    children.push(kvTable([
      [DECISION_LABEL.bsr,       String(decisionCounts.bsr)],
      [DECISION_LABEL.internal,  String(decisionCounts.internal)],
      [DECISION_LABEL.no_action, String(decisionCounts.no_action)],
    ]));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // Channel + anonymity
  children.push(para('Reporter channel & anonymity (new submissions in period)', { bold: true, size: 22, before: 100, after: 100 }));
  if (newInPeriod.length === 0) {
    children.push(para('No new submissions in this period.', { size: 18, italics: true, color: COLOURS.textMuted, after: 240 }));
  } else {
    const rows = Object.entries(channelCounts).map(([k, v]) =>
      [CHANNEL_LABEL[k] ?? k, String(v)]);
    rows.push(['Anonymous reports', anonPct == null ? '—' : `${anonymousNew} (${anonPct}%)`]);
    children.push(kvTable(rows));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // Status distribution at end
  children.push(para('Status of cases at end of period', { bold: true, size: 22, before: 100, after: 100 }));
  if (statusAtEnd.size === 0) {
    children.push(para('No active cases at end of period.', { size: 18, italics: true, color: COLOURS.textMuted, after: 240 }));
  } else {
    const rows = STATUS_ORDER
      .filter(s => statusAtEnd.has(s))
      .map(s => [STATUS_LABEL[s] ?? s, String(statusAtEnd.get(s))]);
    children.push(kvTable(rows));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // Case-by-case summary
  children.push(para(`Cases active in period (${activeInPeriod.length})`, { bold: true, size: 24, before: 100, after: 100 }));
  if (activeInPeriod.length === 0) {
    children.push(para('No cases active in this period.', { size: 18, italics: true, color: COLOURS.textMuted, after: 240 }));
  } else {
    const sorted = [...activeInPeriod].sort((a, b) =>
      (a.reference > b.reference ? 1 : -1));
    const withNotes = sorted.map(c => ({ ...c, _outcomeNote: outcomeNote(c) }));
    children.push(caseSummaryTable(withNotes));
    children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
  }

  // Lessons learned
  if (lessons.length > 0) {
    children.push(para(`Lessons learned (${lessons.length})`, { bold: true, size: 24, before: 100, after: 100 }));
    for (const l of lessons) {
      children.push(para(`${l.ref}  ·  closed ${l.closedAt?.slice(0, 10) ?? '—'}`,
        { bold: true, size: 18, color: COLOURS.subheading, after: 40 }));
      children.push(para(l.text, { size: 18, after: 180 }));
    }
  }

  // Footer note
  children.push(new Paragraph({ spacing: { before: 400, after: 0 }, children: [] }));
  children.push(para(`Generated ${fmtGenerated()} from the LH Portal MOR app.`,
    { size: 14, italics: true, color: COLOURS.textMuted, align: AlignmentType.RIGHT }));

  // ── Pack and stream ──────────────────────────────────────────────────
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
  const filename = `mor-summary-${startStr}-to-${endStr}.docx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
