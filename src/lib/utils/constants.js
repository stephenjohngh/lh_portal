// src/lib/utils/constants.js
//
// Single source of truth for the Issues app's status / priority
// vocabulary. Importing from here is preferred over hard-coding the
// strings — they appear in DB rows, audit logs, filters, dropdowns,
// and Word reports, and they all need to stay in lock-step.
//
// Section accents (amber for actions, blue for activity log) are NOT here
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

// ── Activity types ───────────────────────────────────────────────────
// The activity log (formerly "comments & decisions") stores all
// issue-related entries in one table. Each row has an activity_type
// value from this registry. Extend here when adding new types —
// the UI and DB migration must both be updated when a new type is added.
export const ACTIVITY_TYPE = {
  COMMENT:  'comment',
  DECISION: 'decision',
  NOTE:     'note',
  EMAIL:    'email',
  CALL:     'call',
  LETTER:   'letter'
};

/**
 * Full configuration for each activity type.
 *
 * Used by ActivityLogSection (form picker, field inputs) and
 * ActivityItem (display, edit form, border colours, badges).
 *
 * fields[] — structured metadata fields captured per type.
 * Each field: { key, label, type ('text'|'date'|'select'), placeholder?, options?, span (1|2) }
 * span:2 takes the full 2-col grid width.
 */
export const ACTIVITY_TYPE_CONFIG = {
  [ACTIVITY_TYPE.COMMENT]: {
    label:       'Comment',
    icon:        '💬',
    borderColor: 'border-blue-400',
    badgeClass:  null,
    badgeText:   null,
    ringClass:   'focus:ring-blue-500',
    borderEdit:  'border-blue-500/50',
    placeholder: 'Enter your comment…',
    fields:      []
  },
  [ACTIVITY_TYPE.DECISION]: {
    label:       'Decision',
    icon:        '✅',
    borderColor: 'border-violet-400',
    badgeClass:  'bg-violet-900/40 text-violet-300 border border-violet-700/50',
    badgeText:   'Decision',
    ringClass:   'focus:ring-violet-500',
    borderEdit:  'border-violet-500/50',
    placeholder: 'Enter the decision reached…',
    fields:      []
  },
  [ACTIVITY_TYPE.NOTE]: {
    label:       'Note',
    icon:        '📝',
    borderColor: 'border-amber-400',
    badgeClass:  'bg-amber-900/40 text-amber-300 border border-amber-700/50',
    badgeText:   'Note',
    ringClass:   'focus:ring-amber-500',
    borderEdit:  'border-amber-500/50',
    placeholder: 'Enter your note…',
    fields:      []
  },
  [ACTIVITY_TYPE.EMAIL]: {
    label:       'Email',
    icon:        '📧',
    borderColor: 'border-cyan-400',
    badgeClass:  'bg-cyan-900/40 text-cyan-300 border border-cyan-700/50',
    badgeText:   'Email',
    ringClass:   'focus:ring-cyan-500',
    borderEdit:  'border-cyan-500/50',
    placeholder: 'Summarise the email or paste key excerpts…',
    fields: [
      { key: 'from',       label: 'From',    type: 'text', placeholder: 'Sender name or address',    span: 1 },
      { key: 'to',         label: 'To',      type: 'text', placeholder: 'Recipient name or address', span: 1 },
      { key: 'subject',    label: 'Subject', type: 'text', placeholder: 'Email subject line',        span: 2 },
      { key: 'email_date', label: 'Date',    type: 'date', placeholder: '',                          span: 1 }
    ]
  },
  [ACTIVITY_TYPE.CALL]: {
    label:       'Call',
    icon:        '📞',
    borderColor: 'border-green-400',
    badgeClass:  'bg-green-900/40 text-green-300 border border-green-700/50',
    badgeText:   'Call',
    ringClass:   'focus:ring-green-500',
    borderEdit:  'border-green-500/50',
    placeholder: 'Notes from the call…',
    fields: [
      { key: 'caller',    label: 'Caller',    type: 'text',   placeholder: 'Caller name or number', span: 1 },
      { key: 'direction', label: 'Direction', type: 'select', options: ['inbound', 'outbound'],      span: 1 },
      { key: 'duration',  label: 'Duration',  type: 'text',   placeholder: 'e.g. 15 min',           span: 1 }
    ]
  },
  [ACTIVITY_TYPE.LETTER]: {
    label:       'Letter',
    icon:        '📄',
    borderColor: 'border-orange-400',
    badgeClass:  'bg-orange-900/40 text-orange-300 border border-orange-700/50',
    badgeText:   'Letter',
    ringClass:   'focus:ring-orange-500',
    borderEdit:  'border-orange-500/50',
    placeholder: 'Summarise the letter…',
    fields: [
      { key: 'from',        label: 'From',      type: 'text', placeholder: 'Sender',             span: 1 },
      { key: 'to',          label: 'To',        type: 'text', placeholder: 'Recipient',          span: 1 },
      { key: 'reference',   label: 'Reference', type: 'text', placeholder: 'Ref no. or subject', span: 2 },
      { key: 'letter_date', label: 'Date',      type: 'date', placeholder: '',                   span: 1 }
    ]
  }
};

/** Flat list derived from ACTIVITY_TYPE_CONFIG. Use for iteration in type pickers. */
export const ACTIVITY_TYPES = Object.entries(ACTIVITY_TYPE_CONFIG).map(([value, cfg]) => ({
  value,
  label: cfg.label,
  icon:  cfg.icon,
  color: cfg.borderColor,
  badge: cfg.badgeText
}));
