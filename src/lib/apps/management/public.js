// src/lib/apps/management/public.js
//
// PUBLIC INTERFACE of the Management app — the cross-app contract for its dated
// work. Other apps read through here rather than touching `meetings`, `issues`
// or `actions` directly.
//
// Written for the Planner, which shows meetings and action deadlines on the
// building's year. Everything here is READ-only and deliberately so: an action
// closed in the planner and an action closed in Management would be two records
// of one fact, and they would disagree. Completing an action stays in the app
// that owns it.

import { api } from '$lib/utils/api';

/**
 * Ranges are filtered HERE, not in the query.
 *
 * `api.get()` applies every filter with `.eq()`, so a key like
 * `meeting_date.gte` would be sent as a literal column name and match nothing —
 * silently, which is the dangerous part. Dropping to the Supabase client for a
 * range would work, but these are tens of meetings and hundreds of actions: the
 * whole table is a cheaper read than a second query path is to maintain.
 *
 * If either table ever reaches thousands of rows, this comment is where to
 * start — `api.getAllIn` shows the pattern for going the other way.
 */
function within(rows, column, from, to) {
  return rows.filter((row) => {
    const date = row?.[column];
    return date && date >= from && date <= to;
  });
}

/**
 * Meetings in a date window.
 *
 * @param {string} from ISO date
 * @param {string} to   ISO date
 */
export async function listMeetings(from, to) {
  const rows = await api.get('meetings', {
    select: 'id, title, meeting_date, status',
    orderBy: 'meeting_date',
  });
  return within(rows, 'meeting_date', from, to);
}

/**
 * Action deadlines still outstanding, in a date window.
 *
 * Open ones only. A year carrying every deadline ever set would bury the few
 * that are still somebody's problem, which is the opposite of what a planner is
 * for.
 */
export async function listOpenActionDeadlines(from, to) {
  const rows = await api.getAll('actions', {
    select: 'id, action_text, name_text, date_deadline, status',
  });
  return within(rows.filter(r => r.status !== 'completed' && r.date_deadline),
    'date_deadline', from, to);
}
