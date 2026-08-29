// src/lib/apps/management/utils/issueSearch.js
// Searching issues — pure, Type-1 testable, no DOM and no DB.
//
// What was here before was a filter, not a search: it kept an issue whose name,
// description, or any activity body contained the term, and showed the ordinary
// issue card. Three things were wrong with that, and the third is the one that
// mattered.
//
//   * ACTIONS were not searched at all. "Who was chasing the insurers?" is an
//     action, and the search said the issue did not exist.
//   * Activity bodies are stored as HTML, so it searched the markup: `strong`
//     and `href` matched as though somebody had written them, while a phrase
//     interrupted by any formatting — "the **fire** door" — could not be found,
//     because a tag sits in the middle of it.
//   * A match was invisible. An issue with forty activities appeared in the
//     list with no clue which of them mentioned the term, or where. The reader
//     still had to open it and use the browser's own find.
//
// So this returns the MATCHES, not a boolean: where each one is, and the text
// around it. Filtering falls out of that (no matches, no row), and the list can
// show what it found.

import { snippetAround, stripHtml, contains } from '$lib/utils/textSearch.js';
import { ACTIVITY_TYPE_CONFIG, ACTIVITY_TYPE, ISSUE_STATUS } from '$lib/utils/constants';

/** Below this almost everything matches, which helps nobody. */
export const MIN_QUERY = 2;

/** Past this an issue is answering "look inside", not "here is your line". */
export const MAX_MATCHES_PER_ISSUE = 5;

/**
 * The fields of an email/call/letter worth searching, and what to call them.
 *
 * Named rather than "every string in the jsonb": `fields` also carries things
 * like a document's mime type and internal ids, and a hit on `application/pdf`
 * is noise dressed as a result.
 */
const FIELD_LABELS = {
  from:    'From',
  to:      'To',
  cc:      'Cc',
  subject: 'Subject',
  summary: 'Summary',
  filename: 'File',
};

/** The label an activity match is filed under — "Email", "Decision", "Note". */
function activityLabel(activity) {
  const config = ACTIVITY_TYPE_CONFIG[activity?.activity_type]
    ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT];
  return config?.label ?? 'Activity';
}

/**
 * Every place in one issue where the term appears.
 *
 * Ordered by where a reader would look first: the issue's own name and
 * description, then its actions (a thing somebody has to DO outranks a thing
 * somebody said), then its activities newest first.
 *
 * @param {object} issue    an issue with its activities[] and actions[]
 * @param {string} term
 * @returns {{ where: string, label: string, snippet: {text,from,to}, activityId?: string, actionId?: string }[]}
 */
export function issueMatches(issue, term) {
  const query = String(term ?? '').trim();
  if (query.length < MIN_QUERY) return [];

  const found = [];
  const add = (where, label, text, extra = {}) => {
    if (found.length >= MAX_MATCHES_PER_ISSUE) return;
    const snippet = snippetAround(stripHtml(text), query);
    if (snippet) found.push({ where, label, snippet, ...extra });
  };

  add('name', 'Title', issue?.name);
  add('description', 'Description', issue?.description);

  // Actions before activities: an outstanding action is the most actionable
  // thing an issue holds, and burying it under a year of comments would be the
  // wrong way round.
  for (const action of issue?.actions ?? []) {
    add('action', 'Action', action?.action_text, { actionId: action.id });
    // The person, so searching a name finds what they were asked to do.
    add('action', 'Action owner', action?.name_text, { actionId: action.id });
  }

  const activities = [...(issue?.activities ?? [])].sort((a, b) =>
    String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? '')));

  for (const activity of activities) {
    // `historic` rides along because the activity list hides those by default:
    // a match on one can be pointed at but not scrolled to, and saying so beats
    // a click that appears to do nothing.
    const ref = { activityId: activity.id, historic: !!activity.historic };

    add('activity', activityLabel(activity), activity?.body, ref);

    for (const [key, label] of Object.entries(FIELD_LABELS)) {
      const value = activity?.fields?.[key];
      if (typeof value === 'string' && contains(value, query)) {
        add('activity', label, value, ref);
      }
    }
  }

  return found;
}

/**
 * The issues worth showing, each with what was found in it.
 *
 * An empty term returns everything with no matches attached — the list's
 * ordinary state, expressed as the same shape so the caller has one code path
 * rather than two.
 *
 * @param {object[]} issues
 * @param {string} term
 * @returns {{ issue: object, matches: object[] }[]}
 */
export function searchIssues(issues, term) {
  const query = String(term ?? '').trim();
  const list = issues ?? [];

  if (query.length < MIN_QUERY) return list.map(issue => ({ issue, matches: [] }));

  return list
    .map(issue => ({ issue, matches: issueMatches(issue, query) }))
    .filter(result => result.matches.length > 0);
}

/**
 * "3 matches in 2 issues" — what the search found, in words.
 *
 * A count of ISSUES alone would be misleading in both directions: one issue
 * mentioning the term nine times reads as a thin result, and nine issues
 * mentioning it once reads as a rich one.
 */
export function describeMatches(results, term) {
  const query = String(term ?? '').trim();
  if (query.length < MIN_QUERY) return '';
  if (!results.length) return `Nothing matches “${query}”.`;

  const total = results.reduce((sum, r) => sum + r.matches.length, 0);
  const capped = results.some(r => r.matches.length >= MAX_MATCHES_PER_ISSUE);

  const matches = `${total}${capped ? '+' : ''} match${total === 1 ? '' : 'es'}`;
  const issues  = `${results.length} issue${results.length === 1 ? '' : 's'}`;
  return `${matches} in ${issues}`;
}

/**
 * Is this issue in the status tab currently showing?
 *
 * Takes the filter as an ARGUMENT rather than reading it from scope, which is
 * not fussiness: a Svelte `$:` block only tracks the variables it names, so a
 * predicate that closed over `statusFilter` left the list not re-running when
 * the dropdown changed. Passing it in makes the dependency visible to the
 * compiler and to whoever reads the call.
 *
 * An issue with no status at all is Current — the historic default from before
 * the column existed, and there are rows like it.
 *
 * @param {{status?: string}} issue
 * @param {string} statusFilter
 */
export function inStatusTab(issue, statusFilter) {
  if (statusFilter === ISSUE_STATUS.CURRENT) {
    return issue?.status === ISSUE_STATUS.CURRENT || !issue?.status;
  }
  if (statusFilter === ISSUE_STATUS.PARKED)    return issue?.status === ISSUE_STATUS.PARKED;
  if (statusFilter === ISSUE_STATUS.COMPLETED) return issue?.status === ISSUE_STATUS.COMPLETED;
  return false;
}

// ── Meetings ────────────────────────────────────────────────────────────────
//
// A meeting is two things at once: a record in its own right (a title, a date,
// notes, who was there) and a view over items tagged to it. A search that only
// read the first would answer "no" to "which meeting did we agree the roof
// works?" — because the agreement is a decision on an issue, tagged to the
// meeting, not a word in the meeting's own notes.

/**
 * Everywhere a term appears in a meeting, including the items tagged to it.
 *
 * @param {object} meeting
 * @param {object[]} issues       every issue, with activities[] and actions[]
 * @param {string} term
 * @param {(ids: string[], extras: string[]) => string[]} [namesOf]
 *        resolves participant profile ids to names; without it a meeting is
 *        still searchable by everything except who attended
 */
export function meetingMatches(meeting, issues, term, namesOf) {
  const query = String(term ?? '').trim();
  if (query.length < MIN_QUERY || !meeting) return [];

  const found = [];
  const add = (where, label, text, extra = {}) => {
    if (found.length >= MAX_MATCHES_PER_ISSUE) return;
    const snippet = snippetAround(stripHtml(text), query);
    if (snippet) found.push({ where, label, snippet, ...extra });
  };

  add('title', 'Meeting', meeting.title);
  add('notes', 'Notes', meeting.notes);

  const names = namesOf
    ? namesOf(meeting.participants?.profile_ids ?? [], meeting.participants?.extras ?? [])
    : [];
  for (const name of names) add('attendee', 'Attendee', name);

  // What was tagged to this meeting. The issue's NAME rides on each hit, since
  // "which meeting" is only half the answer — the reader wants to know which
  // issue it was about.
  for (const issue of issues ?? []) {
    const taggedActivityIds = new Set(
      (issue.activities ?? []).filter(a => a.meeting_id === meeting.id).map(a => a.id));

    if (issue.meeting_id === meeting.id) {
      add('issue', 'Issue', issue.name, { issueId: issue.id });
    }

    for (const activity of issue.activities ?? []) {
      if (activity.meeting_id !== meeting.id) continue;
      add('activity', activityLabel(activity), activity.body,
        { issueId: issue.id, issueName: issue.name, activityId: activity.id });
    }

    for (const action of issue.actions ?? []) {
      const tagged = action.meeting_id === meeting.id
        || (action.source_activity_id && taggedActivityIds.has(action.source_activity_id));
      if (!tagged) continue;
      add('action', 'Action', action.action_text,
        { issueId: issue.id, issueName: issue.name, actionId: action.id });
    }
  }

  return found;
}

/**
 * The meetings worth showing, each with what was found in it.
 *
 * Same shape and same empty-query behaviour as searchIssues, so the two lists
 * are written the same way.
 */
export function searchMeetings(meetings, issues, term, namesOf) {
  const query = String(term ?? '').trim();
  const list = meetings ?? [];

  if (query.length < MIN_QUERY) return list.map(meeting => ({ meeting, matches: [] }));

  return list
    .map(meeting => ({ meeting, matches: meetingMatches(meeting, issues, query, namesOf) }))
    .filter(result => result.matches.length > 0);
}
