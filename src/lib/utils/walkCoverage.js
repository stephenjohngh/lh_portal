// src/lib/utils/walkCoverage.js
//
// Has a walk-evidenced duty been DONE, judged against everything it covers?
// Pure, no I/O. Replaces "one session inspected everything in that session",
// which let a walk of 7 of a duty's 104 components read as On schedule for all
// of it (found by running the Inspection → Compliance tutorial, 2026-10-26).
//
// ── The rule ────────────────────────────────────────────────────────────────
// A duty is COMPLETE at time T when every component in its scope has a result
// that SAW the component within the duty's cadence window ending at T. The
// results may come from any number of sessions, on any number of days — a
// caretaker who walks three floors on Monday and four on Thursday has done the
// round the moment the last component is seen.
//
//   · Only a result that observed the component counts. NO ACCESS does not: it
//     records that someone attended and could not assess, and "we could not get
//     in" must never quietly become "done".
//   · Only CLOSED sessions count, as before: an open walk is work in progress.
//   · The window is `frequency_days`. A duty with no cadence has no window.
//   · An empty scope is never complete — a walk of nothing is not evidence.
//   · ROTATING duties are not judged here: each period's session IS the cycle
//     (the trigger and what it exercises), so the session's own counts stand.
//
// A session itself can only ever be an ATTEMPT for a duty judged this way —
// evidence that someone tried — and the position reads "Partial — 7 of 104
// observed" rather than implying more.

import { walkEventsFromSessions } from './obligationSchedule.js';
import { DAY_MS } from './dates.js';

/** A result that actually looked at the component. */
const isObserved = (result) => result !== 'no_access';

/** ms for an ISO timestamp, or null. */
function msOf(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Coverage of one duty from its observations.
 *
 * Rounds are found greedily, earliest first: a round COMPLETES at the first
 * moment every component in scope has been seen since the last round
 * completed, each within the cadence window of that moment. Components seen
 * again afterwards count towards the NEXT round, so a re-walk of two floors
 * after a finished round does not complete it again and push the due date out.
 *
 * @param {Set<string>} scopeIds   the components the duty covers
 * @param {Array<{ componentId: string, at: number, sessionId?: string }>} obs
 *        observations that saw a component (already filtered to observed)
 * @param {number|null} windowDays frequency_days, or null for no window
 * @returns {{
 *   inScope: number,
 *   covered: number,                 components seen towards the current round
 *   completeAt: number|null,         when the last finished round completed
 *   completeSession: string|null,    the session whose result completed it
 * }}
 */
export function coverageOf(scopeIds, obs, windowDays) {
  const inScope = scopeIds.size;
  const none = { inScope, covered: 0, completeAt: null, completeSession: null };
  if (inScope === 0) return none;

  /** @type {Map<string, Array<{at: number, sessionId?: string}>>} */
  const byComp = new Map();
  for (const o of obs) {
    if (!scopeIds.has(o.componentId)) continue;
    let list = byComp.get(o.componentId);
    if (!list) byComp.set(o.componentId, (list = []));
    list.push({ at: o.at, sessionId: o.sessionId });
  }
  for (const list of byComp.values()) list.sort((a, b) => a.at - b.at);
  if (byComp.size === 0) return none;

  const windowMs = windowDays ? windowDays * DAY_MS : Infinity;
  const times = [...new Set([...byComp.values()].flatMap((l) => l.map((x) => x.at)))]
    .sort((a, b) => a - b);

  // Latest observation of one component in (after, upTo].
  const latestBetween = (list, after, upTo) => {
    let best = null;
    for (const x of list) { if (x.at > upTo) break; if (x.at > after) best = x; }
    return best;
  };

  let boundary = -Infinity;
  let completeAt = null;
  let completeSession = null;

  for (;;) {
    let found = null;
    for (const T of times) {
      if (T <= boundary) continue;
      let all = true;
      let sessionAtT = null;
      for (const id of scopeIds) {
        const list = byComp.get(id);
        const x = list ? latestBetween(list, boundary, T) : null;
        if (!x || T - x.at >= windowMs) { all = false; break; }
        if (x.at === T) sessionAtT = x.sessionId ?? sessionAtT;
      }
      if (all) { found = { T, sessionAtT }; break; }
    }
    if (!found) break;
    completeAt = found.T;
    completeSession = found.sessionAtT;
    boundary = found.T;
  }

  // Towards the round now in progress (everything since the last one finished).
  const L = times[times.length - 1];
  let covered = 0;
  for (const id of scopeIds) {
    const list = byComp.get(id);
    const x = list ? latestBetween(list, boundary, L) : null;
    if (x && L - x.at < windowMs) covered++;
  }
  return { inScope, covered, completeAt, completeSession };
}

/**
 * Walk evidence events for the schedule, judged by coverage.
 *
 * @param {Object} p
 * @param {Array<any>} p.sessions       walk_sessions rows
 * @param {Array<any>} p.inspections    component_inspections rows:
 *        { walk_session_id, component_id, inspection_result, inspected_at }
 * @param {Array<any>} p.obligations    planned obligations (id, mode, frequency_days)
 * @param {Record<string, Set<string>>} p.scopeIdsByObligation
 *        resolved scope per obligation. An obligation with no entry cannot be
 *        judged, so its sessions stay ATTEMPTS — never a quiet pass.
 * @returns {import('./obligationSchedule.js').EvidenceEvent[]}
 */
export function walkEventsWithCoverage({ sessions, inspections, obligations, scopeIdsByObligation }) {
  const base = walkEventsFromSessions(sessions);
  const byId = new Map((obligations ?? []).map((o) => [o.id, o]));
  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));

  // Observations per obligation, from closed sessions that belong to it.
  /** @type {Map<string, Array<{componentId: string, at: number, sessionId: string}>>} */
  const obsByOb = new Map();
  for (const r of inspections ?? []) {
    if (!isObserved(r.inspection_result)) continue;
    const s = sessionById.get(r.walk_session_id);
    if (!s || s.status !== 'closed' || !s.definition_id) continue;
    const at = msOf(r.inspected_at ?? r.created_at);
    if (at === null) continue;
    let list = obsByOb.get(s.definition_id);
    if (!list) obsByOb.set(s.definition_id, (list = []));
    list.push({ componentId: r.component_id, at, sessionId: s.id });
  }

  const out = [];
  /** @type {Map<string, any[]>} */
  const attemptsByOb = new Map();
  for (const e of base) {
    const ob = byId.get(e.obligationId);
    if (!ob || ob.mode === 'rotating') { out.push(e); continue; }      // rotating: the session is the cycle
    const attempt = { ...e, status: /** @type {const} */ ('attempted') };
    out.push(attempt);
    let list = attemptsByOb.get(e.obligationId);
    if (!list) attemptsByOb.set(e.obligationId, (list = []));
    list.push(attempt);
  }

  for (const [obId, attempts] of attemptsByOb) {
    const ob = byId.get(obId);
    const scope = scopeIdsByObligation?.[obId];
    if (!scope) continue;                                // cannot judge: attempts only

    const observations = obsByOb.get(obId) ?? [];
    const cov = coverageOf(scope, observations, ob.frequency_days ?? null);

    // Each attempt says what ITS session saw of the whole duty: "7 of 104".
    for (const attempt of attempts) {
      const seen = new Set(observations
        .filter((o) => o.sessionId === attempt.sourceId && scope.has(o.componentId))
        .map((o) => o.componentId));
      attempt.covered = seen.size;
      attempt.inScope = scope.size;
    }

    // The newest attempt, where it is not the one that finished a round, says how
    // far the round now under way has got — across every session since the last
    // one finished, not just its own — so "Partial — 15 of 104" is the number a
    // manager needs rather than what the last walk happened to cover.
    const newest = attempts.reduce((a, b) => (Date.parse(a.at) >= Date.parse(b.at) ? a : b));
    if (cov.completeAt === null || newest.sourceId !== cov.completeSession) newest.covered = cov.covered;

    if (cov.completeAt !== null) {
      // Dated when the session that finished the round was closed — the same
      // moment the old rule used — and listed BEFORE it, so that where the two
      // are the same instant "last attempted" reads as the completion.
      const finisher = attempts.find((a) => a.sourceId === cov.completeSession);
      const at = finisher && Date.parse(finisher.at) >= cov.completeAt
        ? finisher.at : new Date(cov.completeAt).toISOString();
      const done = {
        obligationId: obId, kind: /** @type {const} */ ('walk'),
        at, status: /** @type {const} */ ('completed'),
        sourceId: cov.completeSession ?? undefined,
        title: 'Whole scope covered',
        covered: cov.inScope, inScope: cov.inScope,
      };
      const i = finisher ? out.indexOf(finisher) : -1;
      if (i >= 0) out.splice(i, 0, done); else out.push(done);
    }
  }
  return out;
}
