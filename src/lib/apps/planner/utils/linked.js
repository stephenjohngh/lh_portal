// src/lib/apps/planner/utils/linked.js
// Other apps' dated items, in the planner's own shape — pure, no DOM, no DB.
//
// ── The rule this file exists to keep ───────────────────────────────────────
// The planner SHOWS these. It does not own them, does not tick them off, and
// does not write to them. A maintenance job completed in two places is two
// sources of truth for "done", and they will disagree within a week — which is
// the second diary this whole app was designed to avoid.
//
// So every item produced here carries `linked: true`, and the row component
// hides the tick, the skip and the move for anything wearing it. The only thing
// the planner adds is the year they all appear in.
//
// ── Why they are shaped like occurrences ────────────────────────────────────
// The agenda, the buckets and the year grid all read `.date`, `.status` and
// `.series`. Giving foreign items the same shape means one code path renders
// both, one bucketing decides what is overdue, and a maintenance job scheduled
// for last March sorts among the planner's own arrears rather than in a
// separate list nobody reads.

/** Where each kind comes from, and how it should read. */
export const SOURCES = {
  maintenance: { key: 'maintenance', label: 'Maintenance', app: 'Maintenance', category: 'maintenance' },
  meeting:     { key: 'meeting',     label: 'Meeting',     app: 'Management',  category: 'meeting' },
  action:      { key: 'action',      label: 'Action',      app: 'Management',  category: 'other' },
  gt_review:   { key: 'gt_review',   label: 'Review due',  app: 'Golden Thread', category: 'compliance' },
};

/**
 * A foreign row as an occurrence.
 *
 * `event_id` is namespaced by source so it can never collide with a planner
 * event's id — the two live in one list and are keyed together in `{#each}`.
 */
function linkedOccurrence(source, { id, title, date, done = false, detail = null }) {
  if (!id || !date) return null;

  const meta = SOURCES[source];
  return {
    id: null,                       // nothing of ours is stored against it
    event_id: `${source}:${id}`,
    sourceId: id,
    linked: true,
    source: meta.key,
    sourceLabel: meta.label,
    ownerApp: meta.app,
    date,
    scheduled_for: date,
    moved: false,
    status: done ? 'done' : 'due',
    note: detail,
    completed_on: null,
    completed_by: null,
    orphaned: false,
    // A series-shaped stand-in, so every view that reads `.series` keeps
    // working without knowing this item came from somewhere else.
    series: {
      id: `${source}:${id}`,
      title,
      category: meta.category,
      all_day: true,
      start_time: null,
      end_time: null,
      recurrence: { freq: 'once' },
      lead_days: null,
      linked: true,
    },
  };
}

/**
 * A maintenance job.
 *
 * Completed jobs come through as done rather than being dropped: "the boiler
 * was serviced in March" is exactly what somebody looking at last spring wants
 * to see, and hiding it would make a busy year look empty.
 */
export function fromMaintenanceJob(row) {
  return linkedOccurrence('maintenance', {
    id: row?.id,
    title: row?.title ?? 'Maintenance job',
    date: row?.completed_date ?? row?.scheduled_date,
    done: !!row?.completed_date,
    detail: row?.contractor_name ?? null,
  });
}

/** A team meeting. */
export function fromMeeting(row) {
  return linkedOccurrence('meeting', {
    id: row?.id,
    title: row?.title ?? 'Meeting',
    date: row?.meeting_date,
    done: row?.status === 'closed',
  });
}

/**
 * An action with a deadline.
 *
 * Only ones that are still open. A year filled with every deadline ever set
 * would bury the handful that are still somebody's problem.
 */
export function fromAction(row) {
  if (row?.status === 'completed') return null;
  return linkedOccurrence('action', {
    id: row?.id,
    title: row?.action_text ?? 'Action',
    date: row?.date_deadline,
    detail: row?.name_text ?? null,
  });
}

/** A Golden Thread document falling due for review. */
export function fromGtDocument(row) {
  return linkedOccurrence('gt_review', {
    id: row?.id,
    title: `Review: ${row?.title ?? 'document'}`,
    date: row?.review_due,
  });
}

/**
 * Everything foreign, in one list.
 *
 * Each source is optional: a portal where somebody has no Golden Thread
 * permission simply passes nothing for it, and the planner shows the rest
 * rather than failing.
 */
export function linkedOccurrences({ jobs = [], meetings = [], actions = [], gtDocuments = [] } = {}) {
  return [
    ...jobs.map(fromMaintenanceJob),
    ...meetings.map(fromMeeting),
    ...actions.map(fromAction),
    ...gtDocuments.map(fromGtDocument),
  ]
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Which sources a reader has switched on.
 *
 * All of them, by default: somebody opening a planner wants the year, not a
 * configuration exercise. The toggles exist for the case where one source
 * drowns the rest — a building with weekly maintenance jobs, most likely.
 */
export function filterLinked(items = [], enabled = null) {
  if (!enabled) return items;
  return items.filter(i => enabled.includes(i.source));
}
