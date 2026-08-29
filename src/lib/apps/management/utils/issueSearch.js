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
import { ACTIVITY_TYPE_CONFIG, ACTIVITY_TYPE } from '$lib/utils/constants';

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
    add('activity', activityLabel(activity), activity?.body, { activityId: activity.id });

    for (const [key, label] of Object.entries(FIELD_LABELS)) {
      const value = activity?.fields?.[key];
      if (typeof value === 'string' && contains(value, query)) {
        add('activity', label, value, { activityId: activity.id });
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
