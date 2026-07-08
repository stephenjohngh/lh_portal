// src/lib/apps/golden_thread/utils/gtRiskLifecycle.js
//
// Risk state machine — the client-side mirror of gt_risk_is_valid_transition()
// (migration 156). The UI only ever offers transitions the DB will accept, and
// the pure table is Type-1 testable (gtRiskLifecycle.test.js).
//
// identified → assessed → controlled → monitored, with re-assess loops back and
// close/supersede from the active states; closed can reopen to monitored;
// superseded is terminal. Records are never deleted (RLS omits DELETE).

/** @typedef {'identified'|'assessed'|'controlled'|'monitored'|'closed'|'superseded'} RiskStatus */

export const RISK_STATUSES = ['identified', 'assessed', 'controlled', 'monitored', 'closed', 'superseded'];

export const RISK_STATUS_LABELS = {
  identified: 'Identified',
  assessed:   'Assessed',
  controlled: 'Controlled',
  monitored:  'Monitored',
  closed:     'Closed',
  superseded: 'Superseded',
};

export const RISK_STATUS_BADGE = {
  identified: 'bg-slate-600',
  assessed:   'bg-blue-600',
  controlled: 'bg-indigo-600',
  monitored:  'bg-green-600',
  closed:     'bg-slate-500',
  superseded: 'bg-slate-500',
};

/** from → allowed next states. Must match gt_risk_is_valid_transition(). */
const TRANSITIONS = {
  identified: ['assessed', 'closed'],
  assessed:   ['controlled', 'monitored', 'closed', 'superseded', 'identified'],
  controlled: ['monitored', 'assessed', 'closed', 'superseded'],
  monitored:  ['assessed', 'controlled', 'closed', 'superseded'],
  closed:     ['monitored'],
  superseded: [],
};

/** Valid next states from a status (empty for terminal / unknown). */
export function nextRiskStates(status) {
  return TRANSITIONS[status] ?? [];
}

/** Does the state machine permit this transition? */
export function isValidRiskTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}
