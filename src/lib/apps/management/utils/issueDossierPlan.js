// src/lib/apps/management/utils/issueDossierPlan.js
// An issue, as a PLAN for a Dossier pack — pure, Type-1 testable.
//
// Management hands Dossier plain data; Dossier (its public.js createPackFromPlan)
// builds the pack. Nothing here imports Dossier, and nothing is published.
//
// ⛔ EVERYTHING is included — every activity of every type, every action, every
// document, internal notes and "historic" entries too. That is deliberate (the
// author decides what leaves the building when they PUBLISH; the pack is a
// private working copy). The pack's own first page says so.
//
// Layout of the pack:
//   Summary            the issue itself, its facts, and the three tables
//   Activity           one page per activity, oldest first, each with its fields and document
//   Actions            every action as a table
//   Chronology / Correspondence / Document index   built from the activities and files

import { ACTIVITY_TYPE, ACTIVITY_TYPE_CONFIG, getPriorityLabel, getActionStatusLabel } from '#lib/utils/constants.js';
import { calendarDate, fmtDate } from '#lib/utils/dates.js';
import { stripHtml } from '#lib/utils/textSearch.js';

const TYPE_LABEL = (t) => ACTIVITY_TYPE_CONFIG?.[t]?.label ?? (t ? t[0].toUpperCase() + t.slice(1) : 'Entry');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const isImage = (doc) => String(doc?.mime_type ?? '').startsWith('image/');
const day = (v) => (v ? calendarDate(v) : '');
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

/** Plain text (an issue's description) as paragraphs, escaped. */
function plainToHtml(text) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paragraphs = String(text).split(/\n{2,}/);
  return paragraphs.map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

/** The date an activity is about: its own date field where it has one, else when it was written. */
function activityDate(a) {
  const f = a.fields ?? {};
  return (f.email_date || f.letter_date || f.meeting_date || '').slice(0, 10) || day(a.created_at);
}

/** A one-line description of an activity, for the chronology and for page titles. */
function activityLine(a) {
  const f = a.fields ?? {};
  return String(f.summary || f.subject || f.reference || f.title || stripHtml(a.body)).trim();
}

/**
 * @param {{ issue: Record<string, any>, documents?: Record<string, any>[], meetings?: Record<string, any>[] }} input
 *   issue.activities / issue.actions are the arrays Management already holds on the issue.
 *   documents are the issue's document_library rows (entity_type 'issue').
 *   meetings are the meetings the issue was raised or discussed at (id, title, meeting_date).
 *
 * Every page, table, row and file carries a `key` naming what it was made from
 * ('activity:<id>', 'chronology:action:<id>', 'document:<id>', 'summary'…). The
 * pack remembers them, which is what lets it be UPDATED from the issue later
 * (Dossier's "Update from issue") without losing what was written in it.
 */
export function issueToPlan({ issue, documents = [], meetings = [] }) {
  const number = issue.issue_number != null ? `Issue ${issue.issue_number}` : 'Issue';
  const title = `${number} — ${issue.name ?? 'Untitled'}`.slice(0, 120);
  const who = (row) => row?.created_by_profile?.full_name ?? '';

  const plan = {
    version: 1, title,
    description: `Built from Management ${number}. Everything on the issue is here, internal notes included — check each page before you publish anything.`,
    source: { kind: 'management_issue', id: issue.id, label: number },
    folders: [['Issue documents']],
    files: [], pages: [], tables: [],
  };

  // ── Files: every document on the issue, copied from the library ────────────
  const fileRef = new Map();                       // document id → ref
  for (const d of documents) {
    const ref = `doc-${d.id}`;
    fileRef.set(d.id, ref);
    plan.files.push({
      key: `document:${d.id}`,
      name: d.display_name || d.filename || 'File', ref, folder: ['Issue documents'],
      description: d.description ?? null, source: { kind: 'library', documentId: d.id },
    });
  }

  const activities = [...(issue.activities ?? [])]
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || (a.sequence ?? 0) - (b.sequence ?? 0));
  const actions = [...(issue.actions ?? [])]
    .sort((a, b) => String(a.date_deadline ?? '9999').localeCompare(String(b.date_deadline ?? '9999')));

  // ── Activity pages ─────────────────────────────────────────────────────────
  /** @type {{ activity: any, path: string[] }[]} */
  const activityPages = [];
  activities.forEach((a, i) => {
    const label = TYPE_LABEL(a.activity_type);
    const line = activityLine(a);
    const pageTitle = clip(`${String(i + 1).padStart(2, '0')}. ${activityDate(a)} ${label}${line ? ` — ${line}` : ''}`.replace(/\//g, '-'), 90);
    const path = ['Activity', pageTitle];
    activityPages.push({ activity: a, path });

    const f = a.fields ?? {};
    const facts = [`**${label}**`, `Recorded ${fmtDate(a.created_at)}`];
    if (who(a)) facts.push(`by ${who(a)}`);
    if (a.historic) facts.push('marked **historic**');
    const blocks = [{ type: 'text', markdown: facts.join(' · ') }];

    const rows = [];
    for (const fld of ACTIVITY_TYPE_CONFIG?.[a.activity_type]?.fields ?? []) {
      if (fld.key === 'summary' || !f[fld.key]) continue;
      rows.push(`| ${fld.label} | ${esc(f[fld.key])} |`);
    }
    if (f.summary) rows.unshift(`| Summary | ${esc(f.summary)} |`);
    if (rows.length) blocks.push({ type: 'text', markdown: `| | |\n|---|---|\n${rows.join('\n')}` });

    if (a.body && stripHtml(a.body)) blocks.push({ type: 'html', html: a.body });

    const docRef = f.doc_id ? fileRef.get(f.doc_id) : null;
    if (docRef) {
      const doc = documents.find(d => d.id === f.doc_id);
      blocks.push(isImage(doc) ? { type: 'image', file: docRef, width: 'large' } : { type: 'attachment', file: docRef });
    }
    plan.pages.push({ key: `activity:${a.id}`, path, blocks });
  });

  // ── Actions ────────────────────────────────────────────────────────────────
  const actionLines = actions.map(a =>
    `| ${esc(a.action_text)} | ${esc(a.name_text ?? '')} | ${a.date_deadline ? fmtDate(a.date_deadline) : ''} | ${esc(getActionStatusLabel(a.status))} |`);

  // ── Tables ─────────────────────────────────────────────────────────────────
  const chronology = { key: 'table:chronology', template: 'chronology', title: 'Chronology', rows: [] };
  const correspondence = { key: 'table:correspondence', template: 'correspondence', title: 'Correspondence', rows: [] };
  const documentIndex = { key: 'table:document_index', template: 'document_index', title: 'Document index', rows: [] };

  activityPages.forEach(({ activity: a, path }) => {
    const label = TYPE_LABEL(a.activity_type);
    const f = a.fields ?? {};
    chronology.rows.push({
      key: `chronology:activity:${a.id}`,
      fields: { date: activityDate(a), event: clip(`${label}: ${activityLine(a)}`, 200), significance: '' },
      page: path,
    });
    if (a.activity_type === ACTIVITY_TYPE.EMAIL || a.activity_type === ACTIVITY_TYPE.LETTER) {
      correspondence.rows.push({
        key: `correspondence:activity:${a.id}`,
        fields: {
          date: activityDate(a), from: f.from ?? '', to: f.to ?? '',
          subject: f.subject || f.reference || f.summary || '', body: stripHtml(a.body),
        },
        page: path,
        ...(f.doc_id && fileRef.get(f.doc_id) ? { file: fileRef.get(f.doc_id) } : {}),
      });
    }
  });
  // An action's STATUS is on the Actions page only, never in a row: a table row
  // has no versions, so a row that changes as the action moves on could not be
  // put back (an update refreshes the Actions page, which keeps its History).
  for (const a of actions) {
    chronology.rows.push({
      key: `chronology:action:${a.id}`,
      fields: { date: a.date_deadline ?? day(a.created_at), event: clip(`Action${a.date_deadline ? ' due' : ''}: ${a.action_text}`, 200), significance: a.name_text ? `Owner: ${a.name_text}` : '' },
    });
  }
  chronology.rows.sort((x, y) => String(x.fields.date).localeCompare(String(y.fields.date)));
  for (const d of documents) {
    documentIndex.rows.push({
      key: `index:document:${d.id}`,
      fields: { name: d.display_name || d.filename || 'File', date: d.document_date ?? day(d.created_at), author: who(d), notes: d.description ?? '' },
      file: fileRef.get(d.id),
    });
  }
  plan.tables.push(chronology);
  if (correspondence.rows.length) plan.tables.push(correspondence);
  if (documentIndex.rows.length) plan.tables.push(documentIndex);

  // ── Summary page (first), and the Activity / Actions parents ───────────────
  const facts = [
    `| | |`, `|---|---|`,
    `| Issue | ${issue.issue_number ?? ''} |`,
    `| Status | ${esc(issue.status ?? '')} |`,
    `| Priority | ${esc(getPriorityLabel(issue.priority)?.label ?? issue.priority ?? '')} |`,
    `| Opened | ${fmtDate(issue.created_at)} |`,
    `| Activity entries | ${activities.length} |`,
    `| Actions | ${actions.length} |`,
    `| Documents | ${documents.length} |`,
    `| Meetings | ${meetingsFor(issue, meetings, activities, actions).length} |`,
  ].join('\n');
  const summaryBlocks = [
    { type: 'callout', variant: 'warning', markdown: 'This pack was made from a Management issue and includes **everything** on it, internal notes included. Read every page before you publish.' },
    { type: 'heading', level: 2, text: issue.name ?? 'Untitled' },
    { type: 'text', markdown: facts },
  ];
  if (issue.description && stripHtml(issue.description)) {
    summaryBlocks.push({ type: 'heading', level: 3, text: 'Description' }, { type: 'html', html: plainToHtml(issue.description) });
  }
  summaryBlocks.push({ type: 'embedTable', title: 'Chronology' });
  if (correspondence.rows.length) summaryBlocks.push({ type: 'embedTable', title: 'Correspondence' });
  if (documentIndex.rows.length) summaryBlocks.push({ type: 'embedTable', title: 'Document index' });

  plan.pages.unshift({ key: 'summary', path: ['Summary'], blocks: summaryBlocks });

  const activityIntro = activities.length
    ? [{ type: 'text', markdown: `${activities.length} entr${activities.length === 1 ? 'y' : 'ies'}, oldest first. Each has its own page below.` }]
    : [{ type: 'text', markdown: 'There are no activity entries on this issue.' }];
  plan.pages.splice(1, 0, { key: 'activity', path: ['Activity'], blocks: activityIntro });

  plan.pages.push({
    key: 'actions',
    path: ['Actions'],
    blocks: actionLines.length
      ? [{ type: 'text', markdown: `| Action | Owner | Deadline | Status |\n|---|---|---|---|\n${actionLines.join('\n')}` }]
      : [{ type: 'text', markdown: 'There are no actions on this issue.' }],
  });

  plan.pages.push({ key: 'meetings', path: ['Meetings'], blocks: meetingBlocks(issue, meetings, activities, actions) });

  return plan;
}

// ── Meetings ─────────────────────────────────────────────────────────────────
// The meetings the issue was raised at or discussed at, oldest first, each with
// what was recorded for THIS issue there: the same grouping as Management's
// minutes (meetingMinutes.js) — activities tagged to the meeting, and actions
// tagged to it or made from an activity that was.

/** The issue's meetings, oldest first. A meeting nothing names is left out. */
function meetingsFor(issue, meetings, activities, actions) {
  const ids = new Set([issue.meeting_id, ...activities.map(a => a.meeting_id), ...actions.map(a => a.meeting_id)].filter(Boolean));
  return meetings.filter(m => ids.has(m.id))
    .sort((a, b) => String(a.meeting_date ?? '').localeCompare(String(b.meeting_date ?? '')));
}

function meetingBlocks(issue, meetings, activities, actions) {
  const list = meetingsFor(issue, meetings, activities, actions);
  if (!list.length) return [{ type: 'text', markdown: 'This issue has not been raised or discussed at a meeting.' }];

  const blocks = [{ type: 'text', markdown: `Discussed at ${list.length} meeting${list.length === 1 ? '' : 's'}, oldest first.` }];
  for (const m of list) {
    blocks.push({ type: 'heading', level: 3, text: `${m.meeting_date ? fmtDate(m.meeting_date) : 'Undated'} — ${m.title ?? 'Meeting'}` });
    const tagged = activities.filter(a => a.meeting_id === m.id);
    const taggedIds = new Set(tagged.map(a => a.id));
    const acts = actions.filter(a => a.meeting_id === m.id || (a.source_activity_id && taggedIds.has(a.source_activity_id)));
    const lines = [];
    if (issue.meeting_id === m.id) lines.push('- **Raised at this meeting**');
    for (const a of tagged) lines.push(`- **${TYPE_LABEL(a.activity_type)}:** ${clip(activityLine(a), 300).replace(/\n+/g, ' ')}`);
    for (const a of acts) {
      lines.push(`- **Action:** ${clip(String(a.action_text ?? ''), 300).replace(/\n+/g, ' ')}`
        + `${a.name_text ? ` (${a.name_text})` : ''}${a.date_deadline ? `, due ${fmtDate(a.date_deadline)}` : ''}`);
    }
    blocks.push({ type: 'text', markdown: lines.length ? lines.join('\n') : 'Nothing was recorded for this issue at the meeting.' });
  }
  return blocks;
}
