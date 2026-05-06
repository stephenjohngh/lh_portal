// src/lib/utils/constants.js
//
// Single source of truth for the Issues app's status / priority
// vocabulary. Importing from here is preferred over hard-coding the
// strings — they appear in DB rows, audit logs, filters, dropdowns,
// and Word reports, and they all need to stay in lock-step.
//
// Section accents (amber for actions, blue for comments) are NOT here
// — they're inlined as literal Tailwind classes at each call site so
// the JIT can see them. To rebrand: grep for the literal class name.

// ── Issue status ─────────────────────────────────────────────────────
export const ISSUE_STATUS = {
  CURRENT:   'current',
  PARKED:    'parked',
  COMPLETED: 'completed'
};

/** Form select <option>s for the issue status field. */
export const ISSUE_STATUS_OPTIONS = [
  { value: ISSUE_STATUS.CURRENT,   label: 'Current'   },
  { value: ISSUE_STATUS.PARKED,    label: 'Parked'    },
  { value: ISSUE_STATUS.COMPLETED, label: 'Completed' }
];

/** Status-filter dropdown on the Issues list. Same values as
 *  ISSUE_STATUS_OPTIONS but with " Issues" appended for the filter UI. */
export const STATUS_FILTERS = ISSUE_STATUS_OPTIONS.map(o => ({
  value: o.value,
  label: `${o.label} Issues`
}));

// ── Action status ────────────────────────────────────────────────────
export const ACTION_STATUS = {
  PENDING:     'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED:   'completed'
};

/** Form select <option>s for the action status field. */
export const ACTION_STATUS_OPTIONS = [
  { value: ACTION_STATUS.PENDING,     label: 'Pending'     },
  { value: ACTION_STATUS.IN_PROGRESS, label: 'In Progress' },
  { value: ACTION_STATUS.COMPLETED,   label: 'Completed'   }
];

// ── Priorities ───────────────────────────────────────────────────────
// Issue priority is an integer 1–6. The label/color shown on cards
// comes from PRIORITIES; getPriorityLabel(n) is the safe accessor
// (defaults to "Important" when an unknown value is passed).
export const PRIORITIES = [
  { value: 1, label: 'Top Priority',  color: 'bg-slate-600' },
  { value: 2, label: 'Major Project', color: 'bg-slate-600' },
  { value: 3, label: 'Important',     color: 'bg-slate-600' },
  { value: 4, label: 'Minor',         color: 'bg-slate-600' },
  { value: 5, label: 'Admin',         color: 'bg-slate-600' },
  { value: 6, label: 'Pending',       color: 'bg-slate-600' }
];

/**
 * Resolve the PRIORITIES entry for a given priority value.
 * Returns the "Important" entry when the value is missing/unknown.
 * @param {number|string} priority
 */
export function getPriorityLabel(priority) {
  const p = PRIORITIES.find(p => p.value === parseInt(priority));
  return p || PRIORITIES[2];
}
