// src/lib/apps/planner/utils/agenda.js
// From series + stored occurrences to "what is outstanding, and what is coming"
// — pure, Type-1 testable, no DOM and no DB.
//
// ── Expand, then overlay ────────────────────────────────────────────────────
// Occurrences are NOT stored ahead of time. A weekly series over two years is
// a hundred rows of nothing, and changing the rule would mean rewriting every
// one of them. So the rule is expanded on read, and a row exists only where
// somebody has recorded something against that date — ticked it, skipped it,
// moved it, or written a note.
//
// This is the same shape as the capital plan's `plan_overrides`: derive the
// forecast, store only the decisions.
//
// The consequence to keep in mind: a stored occurrence can name a date the rule
// no longer produces (the rule changed after it was ticked). That row is
// history and is kept — see `mergeOccurrences`.

import { expandSeries, daysBetween } from './recurrence.js';

/** What an occurrence can be. */
export const STATUS = {
  DUE:     'due',
  DONE:    'done',
  SKIPPED: 'skipped',
};

/** Which bucket an item falls in, and how each is described. */
export const BUCKETS = [
  { key: 'overdue',   label: 'Overdue' },
  { key: 'due_soon',  label: 'Coming up' },
  { key: 'planned',   label: 'Planned' },
  { key: 'done',      label: 'Done' },
];

/**
 * One series' occurrences in a window, with anything recorded against them.
 *
 * @param {object} series          a planner_events row
 * @param {object[]} stored        its planner_occurrences rows
 * @param {string} from
 * @param {string} to
 * @returns {object[]} occurrences, ascending by the date they fall on
 */
export function mergeOccurrences(series, stored = [], from, to) {
  const rows = (stored ?? []).filter(o => o.event_id === series.id);
  const byDate = new Map(rows.map(o => [o.occurs_on, o]));

  // Drifting series count from the last time this was actually done.
  const completed = rows
    .filter(o => o.status === STATUS.DONE)
    .map(o => o.completed_on ?? o.occurs_on)
    .sort();
  const lastCompleted = completed.length ? completed[completed.length - 1] : null;

  const generated = expandSeries(series, lastCompleted, from, to);

  const out = generated.map(date => {
    const row = byDate.get(date);
    byDate.delete(date);
    return occurrence(series, date, row);
  });

  // Rows the rule no longer produces. Ticking something off and THEN editing
  // the rule must not erase the fact that it was done — that is a record of
  // work, not a projection.
  for (const row of byDate.values()) {
    const date = row.moved_to ?? row.occurs_on;
    if (date >= from && date <= to) out.push(occurrence(series, row.occurs_on, row, true));
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** One occurrence, as the views want it. */
function occurrence(series, date, row, orphaned = false) {
  return {
    id: row?.id ?? null,                 // null until somebody records something
    event_id: series.id,
    series,
    // A moved occurrence shows where it was moved TO; where it came from stays
    // visible, because "this was meant to be Tuesday" is usually the question.
    date: row?.moved_to ?? date,
    scheduled_for: date,
    moved: !!row?.moved_to,
    status: row?.status ?? STATUS.DUE,
    note: row?.note ?? null,
    completed_on: row?.completed_on ?? null,
    completed_by: row?.completed_by ?? null,
    orphaned,
  };
}

/**
 * Every series' occurrences in a window, flattened and in date order.
 *
 * @param {object[]} series
 * @param {object[]} stored  every planner_occurrences row for those series
 */
export function buildOccurrences(series = [], stored = [], from, to) {
  return series
    .filter(s => !s.archived)
    .flatMap(s => mergeOccurrences(s, stored, from, to))
    .sort((a, b) => a.date.localeCompare(b.date)
      || (a.series.start_time ?? '').localeCompare(b.series.start_time ?? ''));
}

/**
 * Which bucket an occurrence belongs in.
 *
 * `due_soon` uses the SERIES' own notice period rather than one figure for
 * everything: a fire-risk-assessment review wants three months' warning and a
 * bin day wants two days. Where a series says nothing, 30 days — the same
 * window the Maintenance diary uses, so the two read alike.
 *
 * Note what is deliberately absent: a "missed" status. An occurrence that was
 * never ticked stays OVERDUE for ever rather than ageing quietly into a
 * different word. Something undone in March is still undone in June, and a
 * planner that stopped saying so would be the reason nobody noticed.
 */
export function bucketOf(occurrence, today) {
  if (occurrence.status === STATUS.DONE || occurrence.status === STATUS.SKIPPED) return 'done';

  const away = daysBetween(today, occurrence.date);
  if (away < 0) return 'overdue';

  const notice = occurrence.series?.lead_days ?? 30;
  return away <= notice ? 'due_soon' : 'planned';
}

/**
 * The agenda: occurrences grouped as the reader thinks of them.
 *
 * Overdue first and oldest-first within it — the thing that has been waiting
 * longest is the thing to do. Everything else is soonest-first, and Done is
 * newest-first because it is a record, not a queue.
 */
export function agenda(occurrences = [], today) {
  const groups = { overdue: [], due_soon: [], planned: [], done: [] };

  // Sorted here rather than relied upon. buildOccurrences already returns date
  // order, but a display function that silently depends on its caller having
  // sorted is a trap for the next caller.
  const ordered = [...occurrences].sort((a, b) => a.date.localeCompare(b.date));
  for (const item of ordered) groups[bucketOf(item, today)].push(item);

  groups.done.reverse();
  return groups;
}

/**
 * "3 overdue · 5 coming up" — the line above the list.
 *
 * Says nothing about what is merely planned or already done. A count of things
 * needing attention is only useful if everything in it needs attention.
 */
export function describeAgenda(groups) {
  const parts = [];
  if (groups.overdue.length)  parts.push(`${groups.overdue.length} overdue`);
  if (groups.due_soon.length) parts.push(`${groups.due_soon.length} coming up`);
  return parts.join(' · ') || 'Nothing outstanding';
}

/**
 * Occurrences by month, for a calendar grid.
 *
 * Keyed 'YYYY-MM' so a caller can ask for a month without re-scanning, and so
 * an empty month is visibly empty rather than missing.
 */
export function byMonth(occurrences = []) {
  const out = new Map();
  for (const item of occurrences) {
    const key = item.date.slice(0, 7);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

/**
 * The patch that records an occurrence, ready for the store.
 *
 * Pure so the RULE is testable without a database: what a tick means, what
 * un-ticking means, and that completing something records the day it was
 * actually done rather than the day it was due — which is the whole input to a
 * drifting series' next date.
 */
export function completionPatch(occurrence, { status, on = null, note = null, userId }) {
  const patch = {
    event_id: occurrence.event_id,
    occurs_on: occurrence.scheduled_for,
    status,
    note,
    updated_by: userId,
  };

  if (status === STATUS.DONE) {
    // The day it was DONE, not the day it was due. A drifting series counts
    // from this, so defaulting it to the due date would quietly re-anchor the
    // series to a date on which nothing happened.
    patch.completed_on = on ?? occurrence.date;
    patch.completed_by = userId;
  } else {
    patch.completed_on = null;
    patch.completed_by = null;
  }

  return patch;
}
