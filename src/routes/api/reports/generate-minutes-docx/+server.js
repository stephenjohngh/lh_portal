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

function fmt(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function fmtShort(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
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
    const meetingActions   = (issue.actions    || []).filter(a => a.meeting_id === id);
    const allActivities    = (issue.activities || []).filter(a => a.meeting_id === id);
    const meetingComments  = allActivities.filter(a => (a.activity_type ?? 'comment') === 'comment');
    const meetingDecisions = allActivities.filter(a => a.activity_type === 'decision');
    const isNew            = issue.meeting_id === id;
    if (!isNew && meetingActions.length === 0 && allActivities.length === 0) continue;
    minutes.push({ issue, isNew, actions: meetingActions, comments: meetingComments, decisions: meetingDecisions });
  }
  minutes.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    return (a.issue.issue_number ?? 0) - (b.issue.issue_number ?? 0);
  });

  // ── Summary line ────────────────────────────────────────────────────────

  const totals = minutes.reduce(
    (acc, m) => ({
      issues:    acc.issues    + (m.isNew ? 1 : 0),
      actions:   acc.actions   + m.actions.length,
      comments:  acc.comments  + m.comments.length,
      decisions: acc.decisions + m.decisions.length
    }),
    { issues: 0, actions: 0, comments: 0, decisions: 0 }
  );

  const summaryParts = [
    `${totals.issues} new issue${totals.issues === 1 ? '' : 's'}`,
    `${totals.actions} action${totals.actions === 1 ? '' : 's'}`,
    `${totals.comments} comment${totals.comments === 1 ? '' : 's'}`,
    ...(totals.decisions > 0 ? [`${totals.decisions} decision${totals.decisions === 1 ? '' : 's'}`] : [])
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
    const { issue, isNew, comments, decisions, actions } = m;

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
        content.push(p(c.body, {
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
        content.push(p(d.body, {
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
