// src/lib/apps/complaints/utils/complaintLifecycle.js
// The complaint state machine — pure, no DOM, no DB.
//
// ⚠ MIRRORS SQL. `complaint_is_valid_transition()` in migration 187 is the
// guarantee; this is so the UI can offer only the legal moves rather than
// offering everything and letting the database say no. Keep the two in parity —
// the same arrangement Golden Thread uses (gtLifecycle.js), and for the same
// reason: a rule that lives only here is a rule until somebody writes a second
// caller.
//
// ── Two shapes worth understanding before editing ──────────────────────────
// `responded` is NOT the end. The s.93 duty is discharged by replying AND by
// the complainant having a route onwards to the Building Safety Regulator.
// Closing on send would hide the escalation window, which is the part the
// regulator looks at.
//
// `escalated_to_bsr` and `withdrawn` are terminal. The BSR's own process is not
// ours to model; what we record is that it happened and what was sent.

export const STATUS = {
  RECEIVED:      'received',
  ACKNOWLEDGED:  'acknowledged',
  INVESTIGATING: 'investigating',
  RESPONDED:     'responded',
  CLOSED:        'closed',
  ESCALATED:     'escalated_to_bsr',
  WITHDRAWN:     'withdrawn',
};

/** Every legal move. The keys are the whole state set. */
const TRANSITIONS = {
  [STATUS.RECEIVED]:      [STATUS.ACKNOWLEDGED, STATUS.WITHDRAWN],
  [STATUS.ACKNOWLEDGED]:  [STATUS.INVESTIGATING, STATUS.WITHDRAWN],
  [STATUS.INVESTIGATING]: [STATUS.RESPONDED, STATUS.WITHDRAWN],
  [STATUS.RESPONDED]:     [STATUS.CLOSED, STATUS.ESCALATED, STATUS.WITHDRAWN],
  // Reopening is real: a closed complaint can go back for investigation, and an
  // escalation can arrive after closure.
  [STATUS.CLOSED]:        [STATUS.INVESTIGATING, STATUS.ESCALATED],
  [STATUS.ESCALATED]:     [],
  [STATUS.WITHDRAWN]:     [],
};

/** In the order a complaint travels, for tabs and ordering. */
export const STATUS_ORDER = [
  STATUS.RECEIVED, STATUS.ACKNOWLEDGED, STATUS.INVESTIGATING,
  STATUS.RESPONDED, STATUS.CLOSED, STATUS.ESCALATED, STATUS.WITHDRAWN,
];

/**
 * How each state reads, and what it means.
 *
 * `hint` is shown beside the state on the case, because "responded" looking
 * like an ending is the single most likely misreading of this machine.
 */
export const STATUS_META = {
  [STATUS.RECEIVED]:      { label: 'Received',      badge: 'bg-slate-600',  hint: 'Logged. Not yet acknowledged.' },
  [STATUS.ACKNOWLEDGED]:  { label: 'Acknowledged',  badge: 'bg-sky-600',    hint: 'The complainant has been told we have it.' },
  [STATUS.INVESTIGATING]: { label: 'Investigating', badge: 'bg-amber-600',  hint: 'Being looked into.' },
  [STATUS.RESPONDED]:     { label: 'Responded',     badge: 'bg-violet-600', hint: 'Outcome sent — still open, so escalation stays visible.' },
  [STATUS.CLOSED]:        { label: 'Closed',        badge: 'bg-green-700',  hint: 'Finished. Can be reopened.' },
  [STATUS.ESCALATED]:     { label: 'Escalated to BSR', badge: 'bg-red-700', hint: 'Taken to the regulator. Their process is not tracked here.' },
  [STATUS.WITHDRAWN]:     { label: 'Withdrawn',     badge: 'bg-slate-700',  hint: 'Withdrawn by the complainant.' },
};

/** A state that is still somebody's problem. Drives the Open queue. */
export const OPEN_STATUSES = [
  STATUS.RECEIVED, STATUS.ACKNOWLEDGED, STATUS.INVESTIGATING, STATUS.RESPONDED,
];

/** Never returns undefined at a render site. */
export function statusMeta(status) {
  return STATUS_META[status] ?? { label: status ?? 'Unknown', badge: 'bg-slate-600', hint: '' };
}

/** Whether a move is legal. Mirrors complaint_is_valid_transition(). */
export function isValidTransition(from, to) {
  if (from === to) return true;                 // an update that does not move
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** The moves available from here, in a fixed order so buttons do not shuffle. */
export function nextStatuses(from) {
  return TRANSITIONS[from] ?? [];
}

/** Nothing further happens to a complaint in these. */
export function isTerminal(status) {
  return nextStatuses(status).length === 0;
}

/** Still on somebody's desk. */
export function isOpen(status) {
  return OPEN_STATUSES.includes(status);
}

/**
 * The date columns a transition should stamp.
 *
 * Kept here rather than in the store so it is testable, and so the store cannot
 * quietly stamp a different set on a second code path.
 *
 * `escalation_told_at` is deliberately NOT here: telling somebody they may
 * escalate is a separate act from their escalating, and it usually happens with
 * the response rather than at a transition.
 */
export function stampsFor(to, now = new Date().toISOString()) {
  switch (to) {
    case STATUS.ACKNOWLEDGED: return { acknowledged_at: now };
    case STATUS.RESPONDED:    return { responded_at: now };
    case STATUS.CLOSED:       return { closed_at: now };
    case STATUS.ESCALATED:    return { escalated_at: now };
    // Reopening from closed clears the closure. Leaving closed_at set would
    // make a live complaint look finished in every report that reads it.
    case STATUS.INVESTIGATING: return { closed_at: null };
    default: return {};
  }
}

/**
 * The timeline entry type a transition should record.
 *
 * A status change is always a `status_change`; the richer types exist for the
 * transitions somebody will later want to find quickly in a long timeline.
 */
export function entryTypeFor(to) {
  switch (to) {
    case STATUS.ACKNOWLEDGED:  return 'acknowledgement';
    case STATUS.INVESTIGATING: return 'investigation';
    case STATUS.RESPONDED:     return 'response';
    case STATUS.CLOSED:        return 'closure';
    case STATUS.ESCALATED:     return 'escalation';
    default:                   return 'status_change';
  }
}

/**
 * What must be true before a transition is allowed to be offered.
 *
 * Returns null when the move is fine, or a sentence saying what is missing.
 * The database enforces the same thing for `responded` (a CHECK requires
 * response_text); this exists so somebody is told BEFORE they press the button
 * rather than by a constraint violation afterwards.
 */
export function blockedReason(complaint, to) {
  if (!complaint) return 'No complaint.';
  if (!isValidTransition(complaint.status, to)) {
    return `A complaint cannot go from ${statusMeta(complaint.status).label} to ${statusMeta(to).label}.`;
  }
  if (to === STATUS.RESPONDED && !String(complaint.response_text ?? '').trim()) {
    return 'Write the response first — it is what is sent to the complainant.';
  }
  if (to === STATUS.CLOSED && !complaint.responded_at) {
    return 'Respond before closing. A complaint closed without a reply is not answered.';
  }
  return null;
}
