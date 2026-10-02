// src/lib/server/managementDocx.js
//
// The three Management Word reports — issues, actions and meeting minutes —
// built on the shared docxHelpers (2026-10-02, PROJECT_STATUS §6aaa item 6).
//
// They were the only three of sixteen builders that did not use docxHelpers,
// each living inside its +server.js where nothing could test it, and they were
// where three recent report bugs were. Moving them here found more:
//   · US Letter paper, where every other report in the portal is A4;
//   · no running header and no page numbers;
//   · an action marked overdue ON its deadline day — the date was read as UTC
//     midnight and compared with the current instant (dates.js isOverdue now);
//   · a completed action still flagged overdue;
//   · an issue with no number printed "null.", an action with no text "null";
//   · the minutes counted an activity of a type they had no heading for, so an
//     issue could appear with nothing under it (meetingMinutes.js `other`);
//   · the minutes re-implemented the grouping the screens share.

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, TableLayoutType,
} from 'docx';
import {
  CONTENT_W, COLOURS, BORDERS, makeHeader, makeFooter, pageProps,
} from './docxHelpers.js';
import { parseHtmlToDocxParagraphs, htmlToText } from './richTextDocx.js';
import { fmtShortDate, fmtDateLong, fmtGenerated, isOverdue, wasModified } from '$lib/utils/dates.js';
import { getPriorityLabel, ACTION_STATUS, ACTIVITY_TYPE_CONFIG } from '$lib/utils/constants.js';
import { buildFieldSummary } from '$lib/apps/management/components/reports/reportUtils.js';
import { buildMeetingMinutes } from '$lib/apps/management/utils/meetingMinutes.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ── Shared pieces ────────────────────────────────────────────────────────────

/** Body text a little larger than the tabular reports: these are read as prose. */
const STYLES = {
  default: { document: { run: { font: 'Arial', size: 22 } } },
  paragraphStyles: [
    {
      id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run:       { size: 36, bold: true, font: 'Arial', color: COLOURS.textDark },
      paragraph: { spacing: { before: 0, after: 120 }, outlineLevel: 0 },
    },
    {
      id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run:       { size: 28, bold: true, font: 'Arial', color: COLOURS.subheading },
      paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 1 },
    },
  ],
};

/** richTextDocx's bullet lists refer to this reference. */
const NUMBERING = {
  config: [{
    reference: 'bullets',
    levels: [{
      level: 0, format: 'bullet', text: '•', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } },
    }],
  }],
};

/**
 * An A4 document with the portal's running header and page-numbered footer.
 * @param {string} title  for the running header
 * @param {any[]} children
 */
export function reportDocument(title, children) {
  return new Document({
    styles: STYLES,
    numbering: NUMBERING,
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader(title, fmtGenerated()) },
      footers: { default: makeFooter() },
      children,
    }],
  });
}

/** Pack a document for a response. */
export async function packReport(doc, filename) {
  const buffer = await Packer.toBuffer(doc);
  return new Response(buffer, {
    headers: {
      'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    },
  });
}

/**
 * A paragraph of text. A "\n" becomes a real line break: inside one run Word
 * shows a raw newline as a SPACE, which printed multi-paragraph comments on
 * one line (fixed 2026-09-28).
 */
function text(value, opts = {}, paraOpts = {}) {
  const { size = 22, bold, italics, color, allCaps } = opts;
  const lines = String(value ?? '').split('\n');
  return new Paragraph({
    ...paraOpts,
    children: lines.map((line, i) => new TextRun({
      text: line, font: 'Arial', size, bold, italics, color, allCaps, ...(i ? { break: 1 } : {}),
    })),
  });
}

/** A rule across the page. */
const rule = (after = 360) => new Paragraph({
  children: [],
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOURS.border } },
  spacing: { after },
});

/** A shaded band holding one line of runs — a heading row for an issue. */
function band(runs, { fill = 'EEEEEE', width = CONTENT_W, indent = 0 } = {}) {
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: [width],
    layout: TableLayoutType.FIXED,
    ...(indent ? { indent: { size: indent, type: WidthType.DXA } } : {}),
    rows: [new TableRow({ children: [new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders: BORDERS,
      shading: { fill, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 180, right: 180 },
      children: [new Paragraph({ children: runs })],
    })] })],
  });
}

const r = (value, opts = {}) => new TextRun({ text: String(value ?? ''), font: 'Arial', ...opts });

/** "#7 — Fire doors", without "null" for a missing number or name. */
function issueLabel(issue, sep = '  —  ') {
  return [issue?.issue_number ? `#${issue.issue_number}` : null, issue?.name || 'Untitled issue']
    .filter(Boolean).join(sep);
}

/** A completed action is never flagged overdue; otherwise overdue the day AFTER its deadline. */
function actionOverdue(action) {
  return action?.status !== ACTION_STATUS.COMPLETED && isOverdue(action?.date_deadline);
}

const byCreated = (dir = 1) => (a, b) =>
  dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ── Issues report ────────────────────────────────────────────────────────────

const ACTIVITY_COLOUR = {
  comment: '1d4ed8', decision: '7c3aed', note: 'd97706', email: '0891b2',
  call: '16a34a', letter: 'ea580c', document: 'e11d48', meeting: '4338ca',
};
const activityLabel = (type) => ACTIVITY_TYPE_CONFIG[type]?.label
  ?? (type ? type[0].toUpperCase() + type.slice(1) : 'Comment');

/**
 * The issues report's content.
 * @param {{ issues: any[], filterDate?: string, includeCurrent?: boolean, includeParked?: boolean,
 *           includeCompleted?: boolean, sortOrder?: 'asc'|'desc', summaryOnly?: boolean }} input
 */
export function buildIssuesReport(input) {
  const { issues = [], filterDate, includeCurrent, includeParked, includeCompleted,
          sortOrder = 'desc', summaryOnly = false } = input;
  const content = [];

  content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [r('Issues Report')] }));

  const statuses = [includeCurrent && 'Current', includeParked && 'Parked', includeCompleted && 'Completed']
    .filter(Boolean).join(', ');
  let header = `Generated ${fmtDateLong(new Date().toISOString())}  ·  Showing: ${statuses || 'all'}`;
  if (filterDate) header += `, created since ${fmtShortDate(filterDate)}`;
  content.push(text(header, { size: 20, color: '666666' }, { spacing: { after: 240 } }));

  // Issues arrive pre-filtered and pre-sorted by the client — split for headings.
  const sections = [
    ['Current Issues',   issues.filter(i => (i.status || 'current') === 'current')],
    ['Parked Issues',    issues.filter(i => i.status === 'parked')],
    ['Completed Issues', issues.filter(i => i.status === 'completed')],
  ];
  for (const [heading, list] of sections) {
    if (!list.length) continue;
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [r(heading)] }));
    for (const issue of list) content.push(...issueBlock(issue, sortOrder, summaryOnly));
  }

  content.push(text('End of Report', { italics: true, color: '999999' },
    { alignment: AlignmentType.CENTER, spacing: { before: 480 } }));
  return content;
}

function issueBlock(issue, sortOrder, summaryOnly) {
  const out = [];
  const priorityW = 1500;
  const titleW = CONTENT_W - priorityW;
  const known = [1, 2, 3, 4, 5, 6].includes(Number(issue.priority));

  out.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [titleW, priorityW],
    rows: [new TableRow({ children: [
      new TableCell({
        borders: BORDERS, width: { size: titleW, type: WidthType.DXA },
        shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 180, right: 180 },
        children: [new Paragraph({ children: [r(issueLabel(issue, '.  ').replace(/^#/, ''), { bold: true, size: 26 })] })],
      }),
      new TableCell({
        borders: BORDERS, width: { size: priorityW, type: WidthType.DXA },
        shading: { fill: known ? '475569' : '6B7280', type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 80, right: 80 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER,
          children: [r(getPriorityLabel(issue.priority).label, { bold: true, size: 18, color: COLOURS.textWhite })] })],
      }),
    ] })],
  }));

  if (issue.description) {
    out.push(text(issue.description, { size: 22 }, { spacing: { before: 120, after: 120 } }));
  }

  let dateInfo = `Created ${fmtShortDate(issue.created_at)} by ${issue.created_by_profile?.full_name || 'Unknown'}`;
  if (wasModified(issue.created_at, issue.updated_at)) {
    dateInfo += `  ·  Modified ${fmtShortDate(issue.updated_at)} by ${issue.updated_by_profile?.full_name || 'Unknown'}`;
  }
  const outstanding = issue.outstandingActions ?? [];
  if (outstanding.length) dateInfo += `  ·  ${plural(outstanding.length, 'outstanding action')}`;
  out.push(text(dateInfo, { size: 18, color: '666666' }, { spacing: { after: 180 } }));

  // Activity log — every type, one chronological list.
  const activities = (issue.activities ?? []).slice().sort(byCreated(sortOrder === 'asc' ? 1 : -1));
  if (activities.length) {
    out.push(text(`Activity Log (${activities.length})`, { bold: true, size: 24, color: '333333' },
      { spacing: { before: 180, after: 120 } }));
    for (const item of activities) {
      const type = item.activity_type || 'comment';
      const fieldsLine = buildFieldSummary(type, item.fields);
      out.push(new Paragraph({
        spacing: { before: 120, after: 20 }, indent: { left: 360 },
        children: [
          r(`[${activityLabel(type)}]`, { bold: true, size: 20, color: ACTIVITY_COLOUR[type] ?? '666666' }),
          ...(fieldsLine ? [r(`  ${fieldsLine}`, { size: 22, bold: true, italics: true, color: '555555' })] : []),
        ],
      }));
      // The body is left out in summary mode when a summary line exists.
      if (!summaryOnly || !fieldsLine) {
        if (item.historic) {
          out.push(text('[Historic]', { bold: true, size: 20, color: 'd97706' }, { indent: { left: 360 } }));
          out.push(...parseHtmlToDocxParagraphs(item.body, { size: 22, color: '888888', italics: true }));
        } else {
          out.push(...parseHtmlToDocxParagraphs(item.body, { size: 22 }));
        }
      }
      let meta = fmtShortDate(item.created_at);
      if (item.created_by_profile?.full_name) meta += `  ·  ${item.created_by_profile.full_name}`;
      if (wasModified(item.created_at, item.updated_at)) meta += `  ·  Modified ${fmtShortDate(item.updated_at)}`;
      out.push(text(meta, { size: 18, color: '999999', italics: true }, { spacing: { after: 120 }, indent: { left: 360 } }));
    }
  }

  if (outstanding.length) {
    out.push(text('Outstanding Actions', { bold: true, size: 24 }, { spacing: { before: 180, after: 120 } }));
    for (const action of outstanding.slice().sort(byCreated(1))) {
      out.push(text(action.action_text || '(no description)', { bold: true, size: 22 },
        { spacing: { before: 60, after: 40 }, indent: { left: 360 } }));
      const details = [
        action.name_text ? `👤 ${action.name_text}` : null,
        action.date_deadline ? `📅 Due ${fmtShortDate(action.date_deadline)}${actionOverdue(action) ? ' — overdue' : ''}` : null,
        action.status ? `Status: ${action.status}` : null,
      ].filter(Boolean);
      if (details.length) {
        out.push(text(details.join('  ·  '), { size: 20, color: '666666' }, { spacing: { after: 40 }, indent: { left: 360 } }));
      }
      let added = `Added ${fmtShortDate(action.created_at)} by ${action.created_by_profile?.full_name || 'Unknown'}`;
      if (wasModified(action.created_at, action.updated_at)) {
        added += `  ·  Modified ${fmtShortDate(action.updated_at)} by ${action.updated_by_profile?.full_name || 'Unknown'}`;
      }
      out.push(text(added, { size: 18, color: '999999', italics: true }, { spacing: { after: 120 }, indent: { left: 360 } }));
    }
  }

  out.push(new Paragraph({ children: [], spacing: { after: 360 } }));
  return out;
}

// ── Actions report ───────────────────────────────────────────────────────────

/**
 * The actions report's content.
 * @param {{ groups: Array<{ issue: any, actions: any[] }>, userName?: string, sortMode?: string }} input
 */
export function buildActionsReport({ groups = [], userName, sortMode }) {
  const content = [];
  const total = groups.reduce((n, g) => n + (g.actions?.length ?? 0), 0);

  content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [r('Actions Report')] }));
  const sortLabel = sortMode === 'deadline'
    ? 'Earliest deadline first'
    : 'Priority → Issue number → Status → Deadline';
  content.push(text([
    `Generated ${fmtShortDate(new Date().toISOString())}`,
    userName,
    `${plural(total, 'action')} across ${plural(groups.length, 'issue')}`,
    `Sorted: ${sortLabel}`,
  ].filter(Boolean).join('  ·  '), { size: 20, color: '888888' }, { spacing: { after: 60 } }));
  content.push(rule());

  let number = 1;
  for (const { issue, actions = [] } of groups) {
    const status = issue?.status === 'parked' ? '  [Parked]' : issue?.status === 'completed' ? '  [Completed]' : '';
    content.push(band([
      r(issueLabel(issue), { bold: true, size: 26 }),
      ...(status ? [r(status, { size: 22, color: '666666' })] : []),
      r(`  (${plural(actions.length, 'action')})`, { size: 20, color: '888888' }),
    ], { fill: 'DDDDDD' }));

    for (const action of actions) {
      content.push(band([
        r(`${number++}.`, { bold: true, size: 22, color: '888888' }),
        r(`  ${action.action_text || '(no description)'}`, { bold: true, size: 22 }),
      ], { fill: 'F5F5F5', width: CONTENT_W - 360, indent: 360 }));
      const details = [
        action.status,
        action.name_text ? `👤 ${action.name_text}` : null,
        action.date_deadline ? `📅 Due ${fmtShortDate(action.date_deadline)}${actionOverdue(action) ? ' — overdue' : ''}` : null,
        `Added ${fmtShortDate(action.created_at)}`,
      ].filter(Boolean).join('  ·  ');
      content.push(text(details, { size: 20, color: '666666' }, { spacing: { before: 60, after: 300 }, indent: { left: 540 } }));
    }
    content.push(new Paragraph({ children: [], spacing: { after: 240 } }));
  }

  content.push(text('End of Report', { italics: true, color: '999999' }, {
    alignment: AlignmentType.CENTER, spacing: { before: 480 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLOURS.border } },
  }));
  return content;
}

// ── Meeting minutes ──────────────────────────────────────────────────────────

/** Each minutes section, in the order the screen shows them. */
const MINUTES_SECTIONS = [
  { key: 'comments',  title: 'Comments',  colour: '1d4ed8' },
  { key: 'decisions', title: 'Decisions', colour: '7c3aed' },
  { key: 'notes',     title: 'Notes',     colour: '0d9488' },
  { key: 'emails',    title: 'Emails',    colour: '0891b2', fields: 'email' },
  { key: 'letters',   title: 'Letters',   colour: '475569', fields: 'letter' },
  { key: 'documents', title: 'Documents', colour: '4b5563', fields: 'document' },
  { key: 'other',     title: 'Other',     colour: '475569', labelled: true },
];

/**
 * The minutes' content. The grouping is meetingMinutes.js — the same the desktop
 * and phone minutes screens use, so the three cannot disagree.
 * @param {{ meeting: any, issues?: any[], attendees?: string[] }} input
 */
export function buildMinutesReport({ meeting, issues = [], attendees = [] }) {
  const content = [];

  content.push(text('Meeting Minutes', { size: 20, color: '888888', allCaps: true }, { spacing: { after: 60 } }));
  content.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [r(meeting.title || 'Meeting', { bold: true, size: 36 })] }));
  content.push(text([
    meeting.meeting_date ? fmtDateLong(meeting.meeting_date) : null,
    meeting.meeting_type,
    meeting.status === 'open' ? 'currently open' : null,
  ].filter(Boolean).join('  ·  '), { size: 22, color: '555555' }, { spacing: { after: 180 } }));

  if (attendees.length) {
    content.push(text('Attendees', { bold: true, size: 22 }, { spacing: { after: 80 } }));
    content.push(text(attendees.join(', '), { size: 22, color: '333333' }, { spacing: { after: 240 } }));
  }
  if (meeting.notes) {
    content.push(text(htmlToText(meeting.notes), { size: 22, italics: true, color: '444444' }, {
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'AAAAAA' } },
      indent: { left: 360 }, spacing: { after: 240 },
    }));
  }

  const { minutes, totals } = buildMeetingMinutes(meeting, issues);
  content.push(text([
    plural(totals.issues, 'new issue'),
    plural(totals.actions, 'action'),
    plural(totals.comments, 'comment'),
    ...[['decisions', 'decision'], ['notes', 'note'], ['emails', 'email'], ['letters', 'letter'],
        ['documents', 'document'], ['other', 'other item']]
      .filter(([k]) => totals[k] > 0).map(([k, w]) => plural(totals[k], w)),
  ].join('  ·  '), { size: 20, color: '888888' }, { spacing: { before: 60, after: 360 } }));
  content.push(rule());

  if (!minutes.length) {
    content.push(text('No items tagged to this meeting.', { size: 22, italics: true, color: '888888' }));
    return content;
  }

  for (const m of minutes) {
    content.push(band([
      r(issueLabel(m.issue, '  '), { bold: true, size: 26 }),
      ...(m.isNew ? [r('  NEW', { bold: true, size: 18, color: '16a34a' })] : []),
    ]));

    for (const section of MINUTES_SECTIONS) {
      const items = (m[section.key] ?? []).slice().sort(byCreated(1));
      if (!items.length) continue;
      content.push(text(section.title, { bold: true, size: 22, color: section.colour }, { spacing: { before: 180, after: 80 } }));
      for (const a of items) {
        const fieldLine = section.fields ? buildFieldSummary(section.fields, a.fields) : '';
        const body = htmlToText(a.body) || (section.key === 'documents' ? fieldLine : '');
        if (section.labelled) {
          content.push(text(activityLabel(a.activity_type), { size: 18, bold: true, color: '666666' }, { indent: { left: 360 }, spacing: { before: 60 } }));
        }
        if (body) content.push(text(body, { size: 22 }, { indent: { left: 360 }, spacing: { before: 60, after: 40 } }));
        const meta = [section.key !== 'documents' ? fieldLine || null : null, a.historic ? 'historic' : null]
          .filter(Boolean).join('  ·  ');
        if (meta) content.push(text(meta, { size: 18, color: '999999', italics: true }, { indent: { left: 360 }, spacing: { after: 120 } }));
      }
    }

    if (m.actions.length) {
      content.push(text('Actions', { bold: true, size: 22, color: 'b45309' }, { spacing: { before: 180, after: 80 } }));
      for (const a of m.actions.slice().sort(byCreated(1))) {
        content.push(text(a.action_text || '(no description)', { size: 22, bold: true }, { indent: { left: 360 }, spacing: { before: 60, after: 40 } }));
        content.push(text([
          a.status,
          a.name_text ? `👤 ${a.name_text}` : null,
          a.date_deadline ? `📅 due ${fmtShortDate(a.date_deadline)}${actionOverdue(a) ? ' — overdue' : ''}` : null,
        ].filter(Boolean).join('  ·  '), { size: 18, color: '666666' }, { indent: { left: 360 }, spacing: { after: 120 } }));
      }
    }
    content.push(new Paragraph({ children: [], spacing: { after: 300 } }));
  }

  content.push(text('End of Minutes', { italics: true, color: '999999' }, {
    alignment: AlignmentType.CENTER, spacing: { before: 480 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLOURS.border } },
  }));
  return content;
}
