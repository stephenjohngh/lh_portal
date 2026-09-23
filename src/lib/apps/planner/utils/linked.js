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

/**
 * Where each kind comes from, and how it should read.
 *
 * `appId` is the permission that governs it. An aggregating view has to ask
 * this: the planner shows four apps' work on one page, and somebody granted the
 * planner has not thereby been granted the Management app. A caretaker who
 * cannot open Management should not meet its meetings here instead.
 */
export const SOURCES = {
  maintenance: { key: 'maintenance', label: 'Maintenance', app: 'Maintenance',   appId: 'maintenance',   category: 'maintenance' },
  meeting:     { key: 'meeting',     label: 'Meeting',     app: 'Management',    appId: 'management',    category: 'meeting' },
  action:      { key: 'action',      label: 'Action',      app: 'Management',    appId: 'management',    category: 'other' },
  gt_review:   { key: 'gt_review',   label: 'Review due',  app: 'Golden Thread', appId: 'golden_thread', category: 'compliance' },
  // ⭐ Added 2026-09-23, when the user reopened Planner sources: *"one screen,
  // whats overdue, what needs arranging, what is coming up for everything we
  // deal with."* One row per switched-on planned obligation, from
  // compliance/public.js `listObligationDueDates` — the same scheduler the
  // compliance position report uses, never a second derivation.
  // ⛔ `adminOnly`: those due dates are derived from walk sessions, which a
  // non-admin can only see their own of, so for them the dates would be wrong.
  obligation:  { key: 'obligation',  label: 'Planned obligation', app: 'Compliance', appId: 'compliance', category: 'compliance', adminOnly: true },
};

/** How far ahead a contractor visit needs arranging. A walk is in-house and
 *  needs no booking, so it uses the ordinary notice window. */
export const ARRANGING_LEAD_DAYS = 60;
const WALK_LEAD_DAYS = 14;

/**
 * Which sources this user may be shown, from the permissions store's own state.
 *
 * Takes the state rather than reaching for the store, so it stays pure and
 * testable — `permissions.init()` has already loaded every app's row, so this
 * costs no query.
 *
 * ⚠ **This is a UI gate, not a security boundary.** The underlying tables read
 * `USING (auth.uid() IS NOT NULL)` — any signed-in user can still fetch them
 * through PostgREST directly. What this fixes is the planner PRESENTING another
 * app's work to somebody who was never given that app. Closing it properly means
 * per-app-permission RLS on those tables, which is the portal-wide hardening
 * deferred as GT S5 / MOR M7.
 *
 * Admins see everything, as they do everywhere else.
 */
export function visibleSources(permissions) {
  const { isAdmin = false, appPermissions = {} } = permissions ?? {};

  return new Set(
    Object.values(SOURCES)
      .filter(source => isAdmin || (!source.adminOnly && appPermissions[source.appId]?.hasAccess))
      .map(source => source.key),
  );
}

/**
 * A foreign row as an occurrence.
 *
 * `event_id` is namespaced by source so it can never collide with a planner
 * event's id — the two live in one list and are keyed together in `{#each}`.
 */
function linkedOccurrence(source, { id, title, date, done = false, detail = null, overdue = false, needsArranging = false, leadDays = null }) {
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
    // Set by a source whose OWN rules say it is overdue on a date that has not
    // passed — a planned obligation never done, which the scheduler calls due
    // now. The planner defers to the owner rather than re-deciding.
    overdue,
    // Due within its lead time with nothing booked: "needs arranging".
    needsArranging,
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
      lead_days: leadDays,
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
 * A switched-on planned obligation, on the date it is next due.
 *
 * ⭐ ONE ITEM PER DUTY, NEVER TWO. When the due date is a BOOKED job
 * (`booked`), that job already appears through the maintenance source, so the
 * obligation is dropped here: the same visit shown twice would read as two
 * things to do. On-demand obligations have no due date and are not shown.
 *
 * - Contractor route, not booked → **needs arranging** within 60 days.
 * - In-house walk → due on its date; nothing to arrange.
 * - Never done → due today, and OVERDUE because the scheduler says so: a duty
 *   with a cadence that has never been discharged is the most urgent state
 *   there is, and the compliance position report reads it the same way.
 *
 * @param {any} row   from compliance/public.js `listObligationDueDates`
 * @param {string} today  YYYY-MM-DD
 */
export function fromObligationDue(row, today) {
  if (!row || row.booked || row.band === 'on_demand') return null;
  const contractor = row.route === 'maintenance_job';
  const neverDone = row.band === 'never_run';
  const date = neverDone ? today : row.nextDue?.slice(0, 10);
  const detail = [
    neverDone ? 'Never done' : null,
    contractor ? 'Contractor visit — not booked' : row.route === 'inspection' ? 'In-house walk' : null,
  ].filter(Boolean).join(' · ') || null;
  return linkedOccurrence('obligation', {
    id: row.id,
    title: row.name ?? 'Planned obligation',
    date,
    detail,
    overdue: !!row.overdue,
    needsArranging: contractor,
    leadDays: contractor ? ARRANGING_LEAD_DAYS : WALK_LEAD_DAYS,
  });
}

/**
 * Everything foreign, in one list.
 *
 * Each source is optional: a portal where somebody has no Golden Thread
 * permission simply passes nothing for it, and the planner shows the rest
 * rather than failing.
 */
export function linkedOccurrences({ jobs = [], meetings = [], actions = [], gtDocuments = [], obligations = [] } = {}, today = null) {
  return [
    ...jobs.map(fromMaintenanceJob),
    ...meetings.map(fromMeeting),
    ...actions.map(fromAction),
    ...gtDocuments.map(fromGtDocument),
    ...obligations.map((o) => fromObligationDue(o, today)),
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
