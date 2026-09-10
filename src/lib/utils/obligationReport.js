// src/lib/utils/obligationReport.js
//
// The two periodic-compliance reports, as pure functions.
//
//   compliancePosition()  — one row per requirement: where it comes from, who
//                           owns it, when it was last completed, when it was
//                           last ATTEMPTED and how that went, when it is next
//                           due, and whether it is in breach. A point-in-time
//                           statement — the thing you hand an assessor.
//
//   evidenceHistory()     — one row per OCCURRENCE in a date window: every walk
//                           and every job for a selected set of requirements,
//                           with outcome, who did it and what it produced. The
//                           "prove it" report.
//
// No I/O — Type-1 testable, and the same functions feed the screen and the
// Word export so the printed report can never disagree with what was on it.

import {
  STATUTORY_TEMPLATE, templateEntry, isSchedulable, isUnhomed, isSuperseded,
  supersededNote, BASIS_RANK, GROUPS,
} from './statutoryTemplate.js';
import { computeObligationSchedule } from './obligationSchedule.js';
import { currentDecisions } from './statutoryExclusions.js';

const BAND_RANK = { never_run: 0, overdue: 1, due_soon: 2, ok: 3, on_demand: 4 };

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Row status, worst first — the order the summary counts read in. */
export const ROW_STATUS = [
  'breach', 'gap', 'attention', 'ok', 'elsewhere', 'unhomed', 'excluded',
  'superseded', 'retired',
];

export const ROW_STATUS_LABEL = {
  breach:     'In breach',
  gap:        'Not scheduled',
  attention:  'Needs attention',
  ok:         'On schedule',
  elsewhere:  'Tracked in another app',
  unhomed:    'Nothing deals with it',
  excluded:   'Recorded as not applicable',
  superseded: 'No longer required',
  retired:    'Retired',
};

/**
 * Statuses that are NOT a failing. Kept as a named set because the difference
 * between "we are not doing this" and "this is no longer required" is the whole
 * point of flagging rather than deleting, and three surfaces need to agree on
 * it: the summary colours, the Word document, and anyone reading either.
 */
export const NON_FAILING = new Set(['ok', 'elsewhere', 'excluded', 'superseded', 'retired']);

/** Latest completed and latest attempted evidence per obligation id. */
function latestEvidence(events) {
  /** @type {Map<string, {completed: any, attempted: any}>} */
  const out = new Map();
  for (const e of events ?? []) {
    if (!e?.obligationId || e.status === 'planned') continue;
    const held = out.get(e.obligationId) ?? { completed: null, attempted: null };
    const t = Date.parse(e.at ?? '') || 0;
    // 'attempted' tracks EVERY non-planned occurrence, completed ones included:
    // "when was this last touched at all" is a different question from "when
    // was it last discharged", and the gap between the two answers is where
    // compliance actually fails.
    if (!held.attempted || t > (Date.parse(held.attempted.at) || 0)) held.attempted = e;
    if (e.status === 'completed' && (!held.completed || t > (Date.parse(held.completed.at) || 0))) {
      held.completed = e;
    }
    out.set(e.obligationId, held);
  }
  return out;
}

/**
 * How an attempt went, in one phrase.
 *
 * A walk that covered part of its scope is NOT a pass and not a failure — it is
 * evidence that someone tried, which for a best-endeavours duty (flat entrance
 * doors) is exactly what the law asks for. Saying "31 of 40" rather than
 * "complete" is the difference between an honest report and one that overstates
 * the position on the most scrutinised check in the building.
 */
export function outcomeText(event) {
  if (!event) return null;
  if (event.kind === 'walk') {
    if (event.status === 'completed') return `Completed — all ${event.inScope ?? 0} in scope`;
    const covered = event.covered ?? 0;
    const scope = event.inScope ?? 0;
    return scope > 0 ? `Partial — ${covered} of ${scope} observed` : 'Closed with nothing in scope';
  }
  if (event.status !== 'completed') return 'Booked, not yet done';
  return event.result ? `Completed — ${event.result}` : 'Completed';
}

/** Aggregate several schedule states into the row's position. Worst wins. */
function worstState(states) {
  if (states.length === 0) return null;
  return [...states].sort((a, b) =>
    (BAND_RANK[a.band] ?? 9) - (BAND_RANK[b.band] ?? 9)
    || (a.sortKey ?? 0) - (b.sortKey ?? 0))[0];
}

/** Oldest completion across the obligations satisfying one requirement. */
function oldestCompletion(events) {
  const done = events.filter(Boolean);
  if (done.length === 0) return null;
  return done.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0))[0];
}

function statusOf({ entry, obligations, state, excluded, retired, superseded }) {
  // Withdrawn beats everything: if the law no longer requires it, whether we
  // happen to be doing it is not a compliance question.
  if (superseded) return 'superseded';
  if (retired) return 'retired';
  if (excluded) return 'excluded';
  if (entry && !isSchedulable(entry)) return isUnhomed(entry) ? 'unhomed' : 'elsewhere';
  const active = obligations.filter(o => o.active !== false);
  if (active.length === 0) return 'gap';
  if (state?.intervalBreached) return 'breach';
  if (state?.band === 'never_run' || state?.band === 'overdue') return 'breach';
  if (state?.band === 'due_soon') return 'attention';
  return 'ok';
}

/**
 * One row per requirement, covering BOTH the register and anything held that is
 * not in it.
 *
 * A bespoke obligation nobody linked to a register entry is still work this
 * building has committed to, and leaving it out of the compliance report would
 * make the report a description of the register rather than of the building.
 *
 * @param {object} input
 * @param {Array<any>} input.obligations   statutory_obligations rows
 * @param {Array<any>} input.events        EvidenceEvent[] from walks and jobs
 * @param {Array<any>} [input.exclusions]  statutory_exclusions rows
 * @param {{ now?: Date, dueSoonDays?: number }} [opts]
 */
export function compliancePosition({ obligations = [], events = [], exclusions = [] }, opts = {}) {
  const decisions = currentDecisions(exclusions);
  const evidence  = latestEvidence(events);
  const states    = new Map(
    computeObligationSchedule(obligations, events, opts).map(st => [st.definition.id, st]),
  );

  const byKey = new Map();
  for (const o of obligations) {
    const k = o?.template_key;
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(o);
  }

  const rows = [];

  for (const entry of STATUTORY_TEMPLATE) {
    const linked = byKey.get(entry.key) ?? [];
    const decision = decisions.get(entry.key);
    const excluded = decision?.decision === 'not_applicable';
    const withdrawn = isSuperseded(entry, opts.asOf);
    const linkedStates = linked.map(o => states.get(o.id)).filter(Boolean);
    const state = worstState(linkedStates);

    // Oldest completion, not newest: a requirement satisfied by two obligations
    // (two lifts, risers in two cores) is only discharged when BOTH are done,
    // so the newest would flatter the position.
    const completed = oldestCompletion(linked.map(o => evidence.get(o.id)?.completed ?? null));
    const attempted = oldestCompletion(linked.map(o => evidence.get(o.id)?.attempted ?? null));

    rows.push({
      key: entry.key,
      name: entry.name,
      entry,
      basis: entry.basis,
      group: entry.group,
      statutoryRef: entry.statutoryRef,
      frequencyDays: entry.frequencyDays,
      owner: entry.responsibleParty,
      handledBy: entry.handledBy,
      obligations: linked,
      state,
      lastCompleted: completed?.at ?? null,
      lastAttempted: attempted?.at ?? null,
      lastOutcome: outcomeText(attempted),
      nextDue: state?.nextDue ?? null,
      intervalBreached: Boolean(state?.intervalBreached),
      exclusion: decision ?? null,
      retiredOn: entry.supersededOn ?? null,
      retiredReason: withdrawn ? supersededNote(entry) : null,
      status: statusOf({ entry, obligations: linked, state, excluded, superseded: withdrawn }),
    });
  }

  // Anything held that the register does not name.
  for (const o of obligations) {
    if (o?.template_key && templateEntry(o.template_key)) continue;
    const state = states.get(o.id) ?? null;
    const ev = evidence.get(o.id);
    // An obligation created by hand for a NEW legal duty must be able to say
    // it is legislation. Before migration 209 it could not, so the most
    // important row in the report displayed as the most anonymous.
    const retired = Boolean(o.retired_on) && o.retired_on <= (opts.asOf ?? todayISO());
    rows.push({
      key: `obligation:${o.id}`,
      name: o.name,
      entry: null,
      basis: o.basis ?? null,
      intervalBasis: o.interval_basis ?? null,
      group: 'unlisted',
      statutoryRef: o.statutory_ref ?? null,
      frequencyDays: o.frequency_days ?? null,
      owner: o.responsible_party ?? null,
      handledBy: o.evidenced_by === 'maintenance_job' ? 'maintenance' : 'inspection',
      obligations: [o],
      state,
      lastCompleted: ev?.completed?.at ?? null,
      lastAttempted: ev?.attempted?.at ?? null,
      lastOutcome: outcomeText(ev?.attempted ?? null),
      nextDue: state?.nextDue ?? null,
      intervalBreached: Boolean(state?.intervalBreached),
      exclusion: null,
      retiredOn: o.retired_on ?? null,
      retiredReason: o.retired_reason ?? null,
      status: statusOf({ entry: null, obligations: [o], state, excluded: false, retired }),
    });
  }

  return rows;
}

/** Counts by status, worst first — the report's headline. */
export function positionSummary(rows) {
  const out = Object.fromEntries(ROW_STATUS.map(s => [s, 0]));
  for (const r of rows ?? []) if (r.status in out) out[r.status] += 1;
  return out;
}

/**
 * @param {any[]} rows
 * @param {{ groups?: string[], bases?: string[], statuses?: string[], handledBy?: string[], search?: string }} f
 */
export function filterRows(rows, f = {}) {
  const has = (list, v) => !list || list.length === 0 || list.includes(v);
  const q = (f.search ?? '').trim().toLowerCase();
  return (rows ?? []).filter(r =>
    has(f.groups, r.group)
    && has(f.bases, r.basis)
    && has(f.statuses, r.status)
    && has(f.handledBy, r.handledBy)
    && (!q || `${r.name} ${r.statutoryRef ?? ''} ${r.owner ?? ''}`.toLowerCase().includes(q)));
}

export const SORTS = ['register', 'due', 'name', 'lastCompleted'];

export const SORT_LABEL = {
  register:      'Register order (stable)',
  due:           'Most urgent first',
  name:          'Name',
  lastCompleted: 'Longest since completed',
};

/**
 * `register` is the DEFAULT and deliberately so: it never changes between runs,
 * which is what makes two reports comparable. A compliance report whose row
 * order moves every week cannot be diffed against last quarter's, and diffing
 * it is most of why anyone keeps one.
 * @param {any[]} rows
 * @param {'register'|'due'|'name'|'lastCompleted'} sort
 */
export function sortRows(rows, sort = 'register') {
  const list = [...(rows ?? [])];
  const groupIdx = g => { const i = GROUPS.indexOf(g); return i === -1 ? GROUPS.length : i; };

  switch (sort) {
    case 'due':
      return list.sort((a, b) =>
        (BAND_RANK[a.state?.band] ?? 9) - (BAND_RANK[b.state?.band] ?? 9)
        || (a.state?.sortKey ?? 0) - (b.state?.sortKey ?? 0)
        || a.name.localeCompare(b.name));
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'lastCompleted':
      // Never completed sorts worst, not best — the absence of evidence is the
      // strongest signal in the report, not a missing value to push to the end.
      return list.sort((a, b) =>
        (a.lastCompleted ? Date.parse(a.lastCompleted) : -Infinity)
        - (b.lastCompleted ? Date.parse(b.lastCompleted) : -Infinity)
        || a.name.localeCompare(b.name));
    default:
      return list.sort((a, b) =>
        groupIdx(a.group) - groupIdx(b.group)
        || (BASIS_RANK[a.basis] ?? 9) - (BASIS_RANK[b.basis] ?? 9)
        || a.name.localeCompare(b.name));
  }
}

/** Group rows for display, preserving the order they arrive in. */
export function groupRows(rows, by = 'group') {
  const out = new Map();
  for (const r of rows ?? []) {
    const k = by === 'none' ? 'all' : (r[by] ?? 'unlisted');
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
}

export const HISTORY_MODES = ['completed', 'due'];

export const HISTORY_MODE_LABEL = {
  completed: 'Completed in the period',
  due: 'Due in the period',
};

/**
 * Every occurrence for the selected requirements, within a window.
 *
 * `mode` is a real question, not a preference. **completed** answers "show me
 * what was done", which is what evidence means; **due** answers "show me what
 * was supposed to happen", which is how you find what was missed. A booked job
 * that never happened appears in `due` and is invisible in `completed` — that
 * is the point of having both.
 *
 * @param {object} input
 * @param {Array<any>} input.events
 * @param {Array<any>} input.obligations
 * @param {{ from?: string, to?: string, mode?: 'completed'|'due', obligationIds?: string[] }} [opts]
 */
export function evidenceHistory({ events = [], obligations = [] }, opts = {}) {
  const mode = HISTORY_MODES.includes(opts.mode) ? opts.mode : 'completed';
  const from = opts.from ? Date.parse(`${opts.from}T00:00:00Z`) : -Infinity;
  const to   = opts.to   ? Date.parse(`${opts.to}T23:59:59Z`)   : Infinity;
  const only = opts.obligationIds?.length ? new Set(opts.obligationIds) : null;

  const byId = new Map((obligations ?? []).map(o => [o.id, o]));

  return (events ?? [])
    .filter(e => {
      if (!e?.obligationId || !e.at) return false;
      if (only && !only.has(e.obligationId)) return false;
      if (mode === 'completed' && e.status === 'planned') return false;
      const t = Date.parse(e.at);
      return Number.isFinite(t) && t >= from && t <= to;
    })
    .map(e => {
      const o = byId.get(e.obligationId);
      const entry = o?.template_key ? templateEntry(o.template_key) : null;
      return {
        at: e.at,
        kind: e.kind,
        status: e.status,
        obligationId: e.obligationId,
        obligationName: o?.name ?? 'Unknown obligation',
        basis: entry?.basis ?? null,
        group: entry?.group ?? 'unlisted',
        statutoryRef: entry?.statutoryRef ?? o?.statutory_ref ?? null,
        title: e.title ?? null,
        outcome: outcomeText(e),
        result: e.result ?? null,
        by: e.by ?? null,
        reference: e.reference ?? null,
        notes: e.notes ?? null,
        sourceId: e.sourceId ?? null,
      };
    })
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
}
