// src/lib/apps/golden_thread/utils/gtLifecycle.js
//
// Golden Thread document lifecycle — the single client-side source of truth for
// the L2 register's state machine. This MIRRORS the SQL validator
// `gt_is_valid_transition(from, to)` in supabase/migrations/144 (the
// `gt_documents_enforce_invariants_trg` BEFORE UPDATE trigger). The DB is the
// authority; this lets the UI gate actions and lets us unit-test the table
// without a database (Type-1 pure-logic test — gtLifecycle.test.js).
//
// ⚠ Keep TRANSITIONS and the SQL `gt_is_valid_transition` in lockstep — same
// discipline as MOR (migration 137 / morHelpers). A pure-logic test pins this.
//
// States (lowercase, matching the gt_documents.status CHECK constraint):
//   draft → under_review → { current | returned_to_author }
//   current → { superseded | withdrawn }
//   superseded → current            (reactivation)
//   returned_to_author              (terminal — author produces a NEW draft)

/** @typedef {'draft'|'under_review'|'returned_to_author'|'current'|'superseded'|'withdrawn'} GtStatus */

/** All valid statuses, in lifecycle order. */
export const GT_STATUSES = /** @type {GtStatus[]} */ ([
  'draft',
  'under_review',
  'returned_to_author',
  'current',
  'superseded',
  'withdrawn'
]);

/** Display labels (UPPERCASE-ish presentation; stored values stay lowercase). */
export const GT_STATUS_LABELS = /** @type {Record<GtStatus, string>} */ ({
  draft:              'Draft',
  under_review:       'Under Review',
  returned_to_author: 'Returned to Author',
  current:            'Current',
  superseded:         'Superseded',
  withdrawn:          'Withdrawn'
});

/** Badge background class per status (standard-theme Badge component). */
export const GT_STATUS_BADGE = /** @type {Record<GtStatus, string>} */ ({
  draft:              'bg-slate-500',
  under_review:       'bg-amber-600',
  returned_to_author: 'bg-orange-600',
  current:            'bg-green-600',
  superseded:         'bg-slate-600',
  withdrawn:          'bg-red-700'
});

/**
 * The transition table. `TRANSITIONS[from]` = the set of statuses reachable from
 * `from` by a direct status change. Anything not listed is invalid (the DB
 * trigger raises on an invalid transition). `returned_to_author` is terminal.
 * @type {Record<GtStatus, GtStatus[]>}
 */
export const TRANSITIONS = {
  draft:              ['under_review'],
  under_review:       ['current', 'returned_to_author'],
  returned_to_author: [],                       // terminal — a new draft is created instead
  current:            ['superseded', 'withdrawn'],
  superseded:         ['current'],              // reactivation
  withdrawn:          []
};

/**
 * Mirror of SQL `gt_is_valid_transition`. True iff `to` is a permitted direct
 * successor of `from`. A no-op (from === to) is NOT a transition — callers only
 * consult this when the status actually changes, matching the trigger guard
 * (`NEW.status IS DISTINCT FROM OLD.status`).
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isValidTransition(from, to) {
  const allowed = TRANSITIONS[/** @type {GtStatus} */ (from)];
  return Array.isArray(allowed) && allowed.includes(/** @type {GtStatus} */ (to));
}

/**
 * Statuses reachable from `from` (empty for terminal/unknown states).
 * @param {string} from
 * @returns {GtStatus[]}
 */
export function nextStates(from) {
  return TRANSITIONS[/** @type {GtStatus} */ (from)] ?? [];
}

/**
 * Whether a document in `from` can move at all (false for terminal states).
 * @param {string} from
 * @returns {boolean}
 */
export function isTerminal(from) {
  return nextStates(from).length === 0;
}

/**
 * Human label for a status (falls back to the raw value if unknown).
 * @param {string} status
 * @returns {string}
 */
export function statusLabel(status) {
  return GT_STATUS_LABELS[/** @type {GtStatus} */ (status)] ?? status;
}
