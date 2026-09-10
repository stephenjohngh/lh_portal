// src/lib/utils/obligationSchedule.js
//
// ONE due answer for a statutory obligation, across BOTH the stacks that can
// discharge it — an inspection walk or a contractor job. Pure, no I/O.
// P2 of docs/requirements/Obligation_Library_Promotion_Build_Plan.md §7;
// answers Maintenance_Review.md's M3 (the undefined Inspection↔Maintenance
// boundary), which is the same gap as EXT-10 seen from the other side.
//
// ── Why this exists, and why it is shaped like this ─────────────────────────
// The two stacks compute "due" incompatibly, and BOTH are right for their own
// work:
//
//   Inspection — DERIVED at read time. No stored date: the clock is the last
//     COMPLETED closed session + frequency_days. Nothing is booked in advance;
//     a walk happens when someone walks.
//   Maintenance — STORED. A job row is pre-created (up to a year ahead by the
//     bulk generator) and carries a real commitment: a date, often a
//     contractor. That is a fact about the world, not a computed guess.
//
// Unifying them by throwing away pre-generation would be wrong (it discards a
// real booking); unifying them with a stored next_due on the obligation would
// also be wrong (it reintroduces exactly the drift inspectionSchedule.js was
// written to avoid). So instead: an obligation's next due is
//
//   PLANNED  — a booked occurrence exists → the date IS that occurrence's date
//   DERIVED  — nothing booked → last completed evidence + frequency_days
//
// `basis` says which, so a UI can say "booked for the 14th" rather than
// implying the system computed it.
//
// ── Equivalence guarantee ───────────────────────────────────────────────────
// computeInspectionSchedule() in inspectionSchedule.js DELEGATES here (via
// walkEventsFromSessions). Walk events are only ever 'completed' or
// 'attempted' — never 'planned' — so the planned branch cannot fire on
// walk-only input and the Inspection app's behaviour is unchanged by
// construction, not merely by assertion. That is the P2 gate, and
// inspectionSchedule.test.js is its regression net.

const DAY_MS = 86_400_000;

/**
 * @typedef {'completed'|'attempted'|'planned'} EvidenceStatus
 *   completed — it was done, at `at`. Resets the clock.
 *   attempted — a walk was closed without covering its whole scope. Evidence
 *               that someone tried; does NOT reset the clock.
 *   planned   — booked to happen at `at`, not yet done.
 *
 * @typedef {Object} EvidenceEvent
 * @property {string} obligationId
 * @property {'walk'|'job'} kind
 * @property {string} at              ISO timestamp
 * @property {EvidenceStatus} status
 *
 * The four fields above are ALL the scheduler reads. Everything below is
 * reporting detail — who did it, what the outcome was, what it produced — and
 * is deliberately optional: the due-date computation must not acquire an
 * opinion about it, so adding a field here can never change a due date.
 * @property {string}  [sourceId]     walk_sessions.id or maintenance_jobs.id
 * @property {string}  [title]        what the occurrence was called
 * @property {string}  [result]       job result, where one was recorded
 * @property {string}  [by]           engineer, contractor or the session's owner
 * @property {string}  [reference]    certificate or job reference
 * @property {string}  [notes]        completion notes
 * @property {number}  [covered]      components actually inspected
 * @property {number}  [inScope]      components the walk was scoped to
 *
 * @typedef {Object} ObligationScheduleState
 * @property {any}          definition   the obligation row. The KEY stays
 *                                       `definition` deliberately: every
 *                                       consumer and both sort helpers read
 *                                       `state.definition`, and churning them
 *                                       buys nothing the table rename didn't
 *                                       already deliver.
 * @property {string|null}  lastRun
 * @property {string|null}  lastAttempt
 * @property {boolean}      unfinishedAttempt
 * @property {string|null}  nextDue
 * @property {boolean}      overdue
 * @property {number|null}  daysUntilDue
 * @property {'overdue'|'due_soon'|'ok'|'never_run'|'on_demand'} band
 * @property {number}       sortKey
 * @property {'planned'|'derived'|null} basis
 * @property {boolean}      intervalBreached  max_interval_days exceeded since
 *                                            the last completed evidence
 */

/** ms for an ISO timestamp or a date-only string; NaN-safe → null. */
function msOf(value) {
  if (!value) return null;
  // Date-only columns (maintenance_jobs.scheduled_date / completed_date) are
  // pinned to UTC midnight so they compare consistently with the walk stack's
  // real timestamps, rather than drifting by the viewer's offset.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Walk sessions → evidence events. Mirrors computeInspectionSchedule's original
 * filtering exactly: only CLOSED sessions, with a definition_id and a parseable
 * closed_at, contribute.
 *
 * A session counts as a completed run only when every in-scope component was
 * inspected (`inspected_components_count` is stamped at close, backfilled by
 * migration 165; `total_components_count` at start). One finished early is an
 * attempt and must not reset the clock — a zero-scope session is never complete.
 *
 * @param {Array<any>} sessions
 * @returns {EvidenceEvent[]}
 */
export function walkEventsFromSessions(sessions) {
  const out = [];
  for (const s of sessions ?? []) {
    if (!s || s.status !== 'closed' || !s.definition_id || !s.closed_at) continue;
    const t = msOf(s.closed_at);
    if (t === null) continue;
    const total     = s.total_components_count ?? 0;
    const inspected = s.inspected_components_count ?? 0;
    out.push({
      obligationId: s.definition_id,
      kind: 'walk',
      at: new Date(t).toISOString(),
      status: total > 0 && inspected >= total ? 'completed' : 'attempted',
      // Reporting detail. `covered` vs `inScope` is the one that matters most:
      // flat entrance doors are a BEST-ENDEAVOURS duty, so a report that showed
      // only "complete" would overstate the position on the single check most
      // likely to be scrutinised. Both numbers travel so the report can say
      // "addressed 40 of 40, observed 31".
      sourceId: s.id,
      title:    s.name ?? undefined,
      covered:  inspected,
      inScope:  total,
    });
  }
  return out;
}

/**
 * Maintenance jobs → evidence events.
 *
 * `hard_expiry_date` wins when it is EARLIER than the scheduled date — the same
 * rule maintenanceHelpers.jobRag() already applies, because a regulatory or
 * insurance deadline outranks the date someone pencilled in. Diverging from it
 * here would make this function disagree with the badge on the job itself.
 *
 * Cancelled jobs produce nothing: they neither happened nor are they booked.
 *
 * @param {Array<any>} jobs   maintenance_jobs rows (obligation_id = the obligation)
 * @returns {EvidenceEvent[]}
 */
export function jobEventsFromJobs(jobs) {
  const out = [];
  for (const j of jobs ?? []) {
    if (!j || !j.obligation_id || j.status === 'cancelled') continue;

    if (j.completed_date || j.status === 'completed') {
      const t = msOf(j.completed_date ?? j.scheduled_date);
      if (t === null) continue;
      out.push({
        obligationId: j.obligation_id, kind: 'job',
        at: new Date(t).toISOString(), status: 'completed',
        sourceId: j.id,
        title:     j.title ?? undefined,
        result:    j.result ?? undefined,
        by:        j.engineer_name || j.contractor_name || undefined,
        reference: j.reference_number ?? undefined,
        notes:     j.completion_notes ?? undefined,
      });
      continue;
    }

    const scheduled = msOf(j.scheduled_date);
    const hard      = msOf(j.hard_expiry_date);
    const due       = hard !== null && (scheduled === null || hard < scheduled) ? hard : scheduled;
    if (due === null) continue;
    out.push({
      obligationId: j.obligation_id, kind: 'job',
      at: new Date(due).toISOString(), status: 'planned',
      sourceId: j.id,
      title:    j.title ?? undefined,
      by:       j.contractor_name ?? undefined,
    });
  }
  return out;
}

/**
 * Schedule state per obligation, from whatever evidence exists for it.
 *
 * @param {Array<any>} obligations
 * @param {EvidenceEvent[]} events
 * @param {{ now?: Date, dueSoonDays?: number }} [opts]
 * @returns {ObligationScheduleState[]}  input order preserved
 */
export function computeObligationSchedule(obligations, events, opts = {}) {
  const now         = opts.now ?? new Date();
  const nowMs       = now.getTime();
  const dueSoonDays = opts.dueSoonDays ?? 14;

  /** @type {Record<string, number>} */ const lastCompleteMs = {};
  /** @type {Record<string, number>} */ const lastAttemptMs  = {};
  /** @type {Record<string, number>} */ const nextPlannedMs  = {};

  for (const e of events ?? []) {
    if (!e?.obligationId) continue;
    const t = msOf(e.at);
    if (t === null) continue;
    const id = e.obligationId;

    if (e.status === 'planned') {
      // Earliest booking wins: an overdue booked job is more urgent than a
      // future one, and it is still the next thing that has to happen.
      if (nextPlannedMs[id] === undefined || t < nextPlannedMs[id]) nextPlannedMs[id] = t;
      continue;
    }
    // 'attempted' and 'completed' both count as an attempt; only 'completed'
    // moves the clock.
    if (lastAttemptMs[id] === undefined || t > lastAttemptMs[id]) lastAttemptMs[id] = t;
    if (e.status === 'completed' && (lastCompleteMs[id] === undefined || t > lastCompleteMs[id])) {
      lastCompleteMs[id] = t;
    }
  }

  return (obligations ?? []).map((definition) => {
    const freq     = definition.frequency_days;
    const lastT    = lastCompleteMs[definition.id];
    const attemptT = lastAttemptMs[definition.id];
    const planT    = nextPlannedMs[definition.id];

    const lastRun     = lastT    !== undefined ? new Date(lastT).toISOString()    : null;
    const lastAttempt = attemptT !== undefined ? new Date(attemptT).toISOString() : null;
    const unfinishedAttempt = attemptT !== undefined && (lastT === undefined || attemptT > lastT);

    // The statutory ceiling, measured from the last thing that actually
    // happened. With NO completed evidence there is no start date to measure
    // from, and `never_run` already says the loudest thing there is to say —
    // inventing a breach date would be making one up.
    const maxInterval = definition.max_interval_days;
    const intervalBreached = !!(maxInterval && lastT !== undefined
      && nowMs > lastT + maxInterval * DAY_MS);

    const common = { definition, lastRun, lastAttempt, unfinishedAttempt, intervalBreached };

    // 1. A booking beats any computed date — it is a fact, not a derivation.
    //    (Unreachable from walk-only input: walks are never 'planned'.)
    if (planT !== undefined) {
      const overdue      = planT < nowMs;
      const daysUntilDue = Math.ceil((planT - nowMs) / DAY_MS);
      return {
        ...common,
        nextDue: new Date(planT).toISOString(),
        overdue, daysUntilDue,
        band: /** @type {'overdue'|'due_soon'|'ok'} */ (
          overdue ? 'overdue' : (daysUntilDue <= dueSoonDays ? 'due_soon' : 'ok')),
        sortKey: planT,
        basis: /** @type {const} */ ('planned'),
      };
    }

    // 2. On demand: no cadence → never "due".
    if (freq == null) {
      return { ...common, nextDue: null, overdue: false, daysUntilDue: null,
        band: /** @type {const} */ ('on_demand'), sortKey: Infinity, basis: null };
    }

    // 3. Has a cadence but nothing completed → due now, most urgent. An
    //    unfinished attempt does not satisfy this.
    if (lastT === undefined) {
      return { ...common, nextDue: null, overdue: true, daysUntilDue: null,
        band: /** @type {const} */ ('never_run'), sortKey: -Infinity, basis: null };
    }

    // 4. Derived from the last completed evidence.
    const nextDueMs    = lastT + freq * DAY_MS;
    const overdue      = nextDueMs < nowMs;
    const daysUntilDue = Math.ceil((nextDueMs - nowMs) / DAY_MS);
    return {
      ...common,
      nextDue: new Date(nextDueMs).toISOString(),
      overdue, daysUntilDue,
      band: /** @type {'overdue'|'due_soon'|'ok'} */ (
        overdue ? 'overdue' : (daysUntilDue <= dueSoonDays ? 'due_soon' : 'ok')),
      sortKey: nextDueMs,
      basis: /** @type {const} */ ('derived'),
    };
  });
}

/**
 * Is the planned cadence LOOSER than the statutory ceiling? A configuration
 * error worth surfacing on its own: it means the obligation can be fully "up to
 * date" by its own schedule while already breaching the legal maximum, which is
 * the exact failure keeping the two numbers separate is meant to catch.
 * @param {{ frequency_days?: number|null, max_interval_days?: number|null }} obligation
 */
export function planExceedsCeiling(obligation) {
  const freq = obligation?.frequency_days;
  const max  = obligation?.max_interval_days;
  return !!(freq && max && freq > max);
}
