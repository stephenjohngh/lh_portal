// src/routes/api/reports/generate-minutes-docx/+server.js
// Generates a Word document from meeting minutes data.
// Mirrors the layout of MeetingMinutesView.svelte.

import { json } from '@sveltejs/kit';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import { fmtDateLong, fmtShortDate } from '$lib/utils/dates';
import { buildFieldSummary } from '$lib/apps/management/components/reports/reportUtils.js';

const logger = getLogger('GenerateMinutesDocx');

export async function POST({ request }) {
  logger('Minutes DOCX generation request received');
  try {
    const { meeting, issues, attendees } = await request.json();

    if (!meeting) {
      return json({ error: 'No meeting provided' }, { status: 400 });
    }

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: 'Arial', size: 24 } }
        }
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children: buildContent(meeting, issues || [], attendees || [])
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const safe   = (meeting.title ?? 'Minutes').replace(/[^a-zA-Z0-9]+/g, '_');
    const today  = new Date().toISOString().split('T')[0];
    const filename = `Minutes_${safe}_${today}.docx`;

    logger('✅ Generated', filename, buffer.length, 'bytes');

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });
  } catch (err) {
    logger('❌', err.message);
    return json({ error: err.message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------

const BORDER = { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

// Local aliases pointing at the canonical helpers in $lib/utils/dates.
// fmt → fmtDateLong ("23 February 2026"), fmtShort → fmtShortDate ("23 Feb 2026").
const fmt      = iso => iso ? fmtDateLong(iso)  : '';
const fmtShort = iso => iso ? fmtShortDate(iso) : '';

// Convert Tiptap/rich-text HTML to plain text for Word output.
// Preserves paragraph breaks, list bullets, and line breaks.
function htmlToText(html) {
  if (!html || !html.startsWith('<')) return html ?? '';
  return html
    // Block-level closers → newline
    .replace(/<\/p>/gi,   '\n')
    .replace(/<\/li>/gi,  '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // List items — prefix with bullet / number
    .replace(/<li[^>]*>/gi, '• ')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse 3+ newlines → double newline; trim ends
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text: String(text ?? ''), ...opts })],
    ...(opts._para ?? {})
  });
}

function buildContent(meeting, issues, attendees) {
  const content = [];

  // ── Header ──────────────────────────────────────────────────────────────

  content.push(p('Meeting Minutes', {
    size: 20, color: '888888', allCaps: true,
    _para: { spacing: { after: 60 } }
  }));

  content.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: meeting.title, bold: true, size: 36 })],
    spacing: { after: 120 }
  }));

  const subLine = [
    fmt(meeting.meeting_date),
    meeting.meeting_type,
    meeting.status === 'open' ? 'currently open' : null
  ].filter(Boolean).join('  ·  ');

  content.push(p(subLine, { size: 22, color: '555555', _para: { spacing: { after: 180 } } }));

  // ── Attendees ────────────────────────────────────────────────────────────

  if (attendees.length > 0) {
    content.push(p('Attendees', { bold: true, size: 22, _para: { spacing: { after: 80 } } }));
    content.push(p(attendees.join(', '), { size: 22, color: '333333', _para: { spacing: { after: 240 } } }));
  }

  // ── Meeting notes ────────────────────────────────────────────────────────

  if (meeting.notes) {
    content.push(p(meeting.notes, {
      size: 22, italics: true, color: '444444',
      _para: {
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'AAAAAA' } },
        indent: { left: 360 },
        spacing: { after: 240 }
      }
    }));
  }

  // ── Build per-issue minutes (mirrors MeetingMinutesView logic) ────────────

  const id  = meeting.id;
  const minutes = [];
  for (const issue of issues) {
    const allActivities    = (issue.activities || []).filter(a => a.meeting_id === id);
    const meetingActivityIds = new Set(allActivities.map(a => a.id));
    const meetingActions = (issue.actions || []).filter(
      a => a.meeting_id === id ||
           (a.source_activity_id && meetingActivityIds.has(a.source_activity_id))
    );
    const meetingComments  = allActivities.filter(a => (a.activity_type ?? 'comment') === 'comment');
    const meetingDecisions = allActivities.filter(a => a.activity_type === 'decision');
    const meetingNotes     = allActivities.filter(a => a.activity_type === 'note');
    const meetingEmails    = allActivities.filter(a => a.activity_type === 'email');
    const meetingLetters   = allActivities.filter(a => a.activity_type === 'letter');
    const meetingDocuments = allActivities.filter(a => a.activity_type === 'document');
    const isNew            = issue.meeting_id === id;
    if (!isNew && meetingActions.length === 0 && allActivities.length === 0) continue;
    minutes.push({ issue, isNew, actions: meetingActions, comments: meetingComments, decisions: meetingDecisions, notes: meetingNotes, emails: meetingEmails, letters: meetingLetters, documents: meetingDocuments });
  }
  minutes.sort((a, b) => {
    const pa = a.issue.priority ?? 99;
    const pb = b.issue.priority ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.issue.issue_number ?? 0) - (b.issue.issue_number ?? 0);
  });

  // ── Summary line ────────────────────────────────────────────────────────

  const totals = minutes.reduce(
    (acc, m) => ({
      issues:    acc.issues    + (m.isNew ? 1 : 0),
      actions:   acc.actions   + m.actions.length,
      comments:  acc.comments  + m.comments.length,
      decisions: acc.decisions + m.decisions.length,
      notes:     acc.notes     + m.notes.length,
      emails:    acc.emails    + m.emails.length,
      letters:   acc.letters   + m.letters.length,
      documents: acc.documents + m.documents.length,
    }),
    { issues: 0, actions: 0, comments: 0, decisions: 0, notes: 0, emails: 0, letters: 0, documents: 0 }
  );

  const summaryParts = [
    `${totals.issues} new issue${totals.issues === 1 ? '' : 's'}`,
    `${totals.actions} action${totals.actions === 1 ? '' : 's'}`,
    `${totals.comments} comment${totals.comments === 1 ? '' : 's'}`,
    ...(totals.decisions > 0 ? [`${totals.decisions} decision${totals.decisions === 1 ? '' : 's'}`] : []),
    ...(totals.notes     > 0 ? [`${totals.notes} note${totals.notes === 1 ? '' : 's'}`]             : []),
    ...(totals.emails    > 0 ? [`${totals.emails} email${totals.emails === 1 ? '' : 's'}`]           : []),
    ...(totals.letters   > 0 ? [`${totals.letters} letter${totals.letters === 1 ? '' : 's'}`]        : []),
    ...(totals.documents > 0 ? [`${totals.documents} document${totals.documents === 1 ? '' : 's'}`]  : []),
  ];
  content.push(p(summaryParts.join('  ·  '), {
    size: 20, color: '888888',
    _para: { spacing: { before: 60, after: 360 } }
  }));

  // ── Divider ──────────────────────────────────────────────────────────────

  content.push(new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
    spacing: { after: 360 }
  }));

  if (minutes.length === 0) {
    content.push(p('No items tagged to this meeting.', {
      size: 22, italics: true, color: '888888'
    }));
    return content;
  }

  // ── Per-issue sections ────────────────────────────────────────────────────

  for (const m of minutes) {
    const { issue, isNew, comments, decisions, notes, emails, letters, documents, actions } = m;

    // Issue header row (table for shading)
    const headerLabel = [
      issue.issue_number ? `#${issue.issue_number}` : null,
      issue.name,
      isNew ? '  [New Issue]' : null
    ].filter(Boolean).join('  —  ');

    content.push(
      new Table({
        width: { size: 10800, type: WidthType.DXA },
        columnWidths: [10800],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: BORDERS,
                shading: { fill: 'EEEEEE', type: ShadingType.CLEAR },
                margins: { top: 120, bottom: 120, left: 180, right: 180 },
                width: { size: 10800, type: WidthType.DXA },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: headerLabel, bold: true, size: 26 }),
                      ...(isNew ? [new TextRun({ text: '  NEW', bold: true, size: 18, color: '16a34a' })] : [])
                    ]
                  })
                ]
              })
            ]
          })
        ]
      })
    );

    // Comments
    if (comments.length > 0) {
      content.push(p('Comments', {
        bold: true, size: 22, color: '1d4ed8',
        _para: { spacing: { before: 180, after: 80 } }
      }));

      const sorted = [...comments].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
      for (const c of sorted) {
        content.push(p(htmlToText(c.body), {
          size: 22,
          _para: { indent: { left: 360 }, spacing: { before: 60, after: 40 } }
        }));
        const meta = [
          fmtShort(c.created_at),
          c.created_by_profile?.full_name,
          c.historic ? 'historic' : null
        ].filter(Boolean).join('  ·  ');
        content.push(p(meta, {
          size: 18, color: '999999', italics: true,
          _para: { indent: { left: 360 }, spacing: { after: 120 } }
        }));
      }
    }

    // Decisions
    if (decisions.length > 0) {
      content.push(p('Decisions', {
        bold: true, size: 22, color: '7c3aed',
        _para: { spacing: { before: 180, after: 80 } }
      }));

      const sortedDecisions = [...decisions].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
      for (const d of sortedDecisions) {
        content.push(p(htmlToText(d.body), {
          size: 22,
          _para: { indent: { left: 360 }, spacing: { before: 60, after: 40 } }
        }));
        const meta = [
          fmtShort(d.created_at),
          d.created_by_profile?.full_name,
          d.historic ? 'historic' : null
        ].filter(Boolean).join('  ·  ');
        content.push(p(meta, {
          size: 18, color: '999999', italics: true,
          _para: { indent: { left: 360 }, spacing: { after: 120 } }
        }));
      }
    }

    // Notes
    if (notes.length > 0) {
      content.push(p('Notes', {
        bold: true, size: 22, color: '0d9488',
        _para: { spacing: { before: 180, after: 80 } }
      }));

      const sortedNotes = [...notes].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
      for (const n of sortedNotes) {
        content.push(p(htmlToText(n.body), {
          size: 22,
          _para: { indent: { left: 360 }, spacing: { before: 60, after: 40 } }
        }));
        const meta = [
          fmtShort(n.created_at),
          n.created_by_profile?.full_name,
          n.historic ? 'historic' : null
        ].filter(Boolean).join('  ·  ');
        content.push(p(meta, {
          size: 18, color: '999999', italics: true,
          _para: { indent: { left: 360 }, spacing: { after: 120 } }
        }));
      }
    }

    // Emails
    if (emails.length > 0) {
      content.push(p('Emails', {
        bold: true, size: 22, color: '0891b2',
        _para: { spacing: { before: 180, after: 80 } }
      }));

      const sortedEmails = [...emails].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
      for (const e of sortedEmails) {
        if (e.body) {
          content.push(p(htmlToText(e.body), {
            size: 22,
            _para: { indent: { left: 360 }, spacing: { before: 60, after: 40 } }
          }));
        }
        const fieldLine = buildFieldSummary('email', e.fields);
        const meta = [
          fieldLine || null,
          fmtShort(e.created_at),
          e.created_by_profile?.full_name,
          e.historic ? 'historic' : null
        ].filter(Boolean).join('  ·  ');
        content.push(p(meta, {
          size: 18, color: '999999', italics: true,
          _para: { indent: { left: 360 }, spacing: { after: 120 } }
        }));
      }
    }

    // Letters
    if (letters.length > 0) {
      content.push(p('Letters', {
        bold: true, size: 22, color: '475569',
        _para: { spacing: { before: 180, after: 80 } }
      }));

      const sortedLetters = [...letters].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
      for (const l of sortedLetters) {
        if (l.body) {
          content.push(p(htmlToText(l.body), {
            size: 22,
            _para: { indent: { left: 360 }, spacing: { before: 60, after: 40 } }
          }));
        }
        const fieldLine = buildFieldSummary('letter', l.fields);
        const meta = [
          fieldLine || null,
          fmtShort(l.created_at),
          l.created_by_profile?.full_name,
          l.historic ? 'historic' : null
        ].filter(Boolean).join('  ·  ');
        content.push(p(meta, {
          size: 18, color: '999999', italics: true,
          _para: { indent: { left: 360 }, spacing: { after: 120 } }
        }));
      }
    }

    // Documents
    if (documents.length > 0) {
      content.push(p('Documents', {
        bold: true, size: 22, color: '4b5563',
        _para: { spacing: { before: 180, after: 80 } }
      }));

      const sortedDocs = [...documents].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
      for (const d of sortedDocs) {
        const fieldLine = buildFieldSummary('document', d.fields);
        content.push(p(htmlToText(d.body) || fieldLine, {
          size: 22,
          _para: { indent: { left: 360 }, spacing: { before: 60, after: 40 } }
        }));
        const meta = [
          fmtShort(d.created_at),
          d.created_by_profile?.full_name,
          d.historic ? 'historic' : null
        ].filter(Boolean).join('  ·  ');
        content.push(p(meta, {
          size: 18, color: '999999', italics: true,
          _para: { indent: { left: 360 }, spacing: { after: 120 } }
        }));
      }
    }

    // Actions
    if (actions.length > 0) {
      content.push(p('Actions', {
        bold: true, size: 22, color: 'b45309',
        _para: { spacing: { before: 180, after: 80 } }
      }));

      const sorted = [...actions].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
      for (const a of sorted) {
        content.push(p(a.action_text, {
          size: 22, bold: true,
          _para: { indent: { left: 360 }, spacing: { before: 60, after: 40 } }
        }));

        const details = [
          a.status,
          a.name_text  ? `👤 ${a.name_text}`              : null,
          a.date_deadline ? `📅 due ${fmtShort(a.date_deadline)}` : null,
          `added ${fmtShort(a.created_at)}${a.created_by_profile?.full_name ? ' by ' + a.created_by_profile.full_name : ''}`
        ].filter(Boolean).join('  ·  ');

        content.push(p(details, {
          size: 18, color: '666666',
          _para: { indent: { left: 360 }, spacing: { after: 120 } }
        }));
      }
    }

    content.push(new Paragraph({ children: [], spacing: { after: 300 } }));
  }

  // ── Footer ───────────────────────────────────────────────────────────────

  content.push(p('End of Minutes', {
    italics: true, color: '999999',
    _para: {
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } }
    }
  }));

  return content;
}
