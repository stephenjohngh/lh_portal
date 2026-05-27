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
  { value: 1, label: 'Top Priority',  color: 'bg-slate-600 text-white' },
  { value: 2, label: 'Major Project', color: 'bg-slate-600 text-white' },
  { value: 3, label: 'Important',     color: 'bg-slate-600 text-white' },
  { value: 4, label: 'Minor',         color: 'bg-slate-600 text-white' },
  { value: 5, label: 'Admin',         color: 'bg-slate-600 text-white' },
  { value: 6, label: 'Pending',       color: 'bg-slate-600 text-white' }
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

  LETTER:   'letter',
  DOCUMENT: 'document',
  MEETING:  'meeting'   // issue-specific meeting log (distinct from team meetings)
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
  [ACTIVITY_TYPE.NOTE]: {
    label:       'Note',
    icon:        '📝',
    borderColor: 'border-teal-400',
    badgeClass:  'bg-teal-900/40 text-teal-300 border border-teal-700/50',
    badgeText:   'Note',
    ringClass:   'focus:ring-teal-500',
    borderEdit:  'border-teal-500/50',
    placeholder: 'Enter your note…',
    // Light-theme (report preview — white background)
    reportBg:       'bg-teal-50',
    reportBorder:   'border-teal-200',
    reportBadgeCls: 'bg-teal-100 text-teal-700 border-teal-300',
    fields: [
      { key: 'summary', label: 'Summary', type: 'text', placeholder: 'One-line summary for reports…', span: 2 }
    ]
  },
  [ACTIVITY_TYPE.DECISION]: {
    label:       'Decision',
    icon:        '✅',
    borderColor: 'border-yellow-400',
    badgeClass:  'bg-yellow-900/40 text-yellow-300 border border-yellow-700/50',
    badgeText:   'Decision',
    ringClass:   'focus:ring-yellow-500',
    borderEdit:  'border-yellow-500/50',
    placeholder: 'Enter the decision reached…',
    reportBg:       'bg-yellow-50',
    reportBorder:   'border-yellow-200',
    reportBadgeCls: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    fields: [
      { key: 'summary', label: 'Summary', type: 'text', placeholder: 'One-line summary for reports…', span: 2 }
    ]
  },
  [ACTIVITY_TYPE.COMMENT]: {
    label:       'Comment',
    icon:        '💬',
    borderColor: 'border-blue-400',
    badgeClass:  'bg-blue-900/40 text-blue-300 border border-blue-700/50',
    badgeText:   'Comment',
    ringClass:   'focus:ring-blue-500',
    borderEdit:  'border-blue-500/50',
    placeholder: 'Enter your comment…',
    reportBg:       'bg-gray-50',
    reportBorder:   'border-gray-200',
    reportBadgeCls: 'bg-gray-100 text-gray-600 border-gray-300',
    fields: [
      { key: 'summary', label: 'Summary', type: 'text', placeholder: 'One-line summary for reports…', span: 2 }
    ]
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
    reportBg:       'bg-cyan-50',
    reportBorder:   'border-cyan-200',
    reportBadgeCls: 'bg-cyan-100 text-cyan-700 border-cyan-300',
    fields: [
      { key: 'summary',    label: 'Summary',     type: 'text', placeholder: 'One-line summary for reports…', span: 2 },
      { key: 'from',       label: 'From',        type: 'text', placeholder: 'Sender name or address',        span: 1 },
      { key: 'to',         label: 'To',          type: 'text', placeholder: 'Recipient name or address',     span: 1 },
      { key: 'subject',    label: 'Subject',     type: 'text', placeholder: 'Email subject line',            span: 2 },
      { key: 'email_date', label: 'Date',        type: 'date', placeholder: '',                              span: 1 }
    ]
  },

  [ACTIVITY_TYPE.LETTER]: {
    label:       'Letter',
    icon:        '📄',
    borderColor: 'border-slate-400',
    badgeClass:  'bg-slate-700/60 text-slate-300 border border-slate-500/50',
    badgeText:   'Letter',
    ringClass:   'focus:ring-slate-400',
    borderEdit:  'border-slate-400/50',
    placeholder: 'Summarise the letter…',
    reportBg:       'bg-gray-100',
    reportBorder:   'border-gray-300',
    reportBadgeCls: 'bg-gray-200 text-gray-700 border-gray-300',
    fields: [
      { key: 'summary',     label: 'Summary',   type: 'text', placeholder: 'One-line summary for reports…', span: 2 },
      { key: 'from',        label: 'From',      type: 'text', placeholder: 'Sender',             span: 1 },
      { key: 'to',          label: 'To',        type: 'text', placeholder: 'Recipient',          span: 1 },
      { key: 'reference',   label: 'Reference', type: 'text', placeholder: 'Ref no. or subject', span: 2 },
      { key: 'letter_date', label: 'Date',      type: 'date', placeholder: '',                   span: 1 }
    ]
  },
  [ACTIVITY_TYPE.DOCUMENT]: {
    label:       'Document',
    icon:        '📎',
    borderColor: 'border-gray-200',
    badgeClass:  'bg-black/60 text-white border border-gray-500/50',
    badgeText:   'Document',
    ringClass:   'focus:ring-gray-300',
    borderEdit:  'border-gray-300/50',
    placeholder: 'Notes about this document…',
    reportBg:       'bg-gray-900',
    reportBorder:   'border-gray-700',
    reportBadgeCls: 'bg-gray-800 text-white border-gray-600',
    fields: [
      { key: 'summary', label: 'Summary', type: 'text', placeholder: 'One-line summary for reports…', span: 2 }
    ]
  },
  [ACTIVITY_TYPE.MEETING]: {
    label:       'Meeting',
    icon:        '🤝',
    borderColor: 'border-rose-400',
    badgeClass:  'bg-rose-900/40 text-rose-300 border border-rose-700/50',
    badgeText:   'Meeting',
    ringClass:   'focus:ring-rose-500',
    borderEdit:  'border-rose-500/50',
    placeholder: 'Notes from the meeting…',
    reportBg:       'bg-rose-50',
    reportBorder:   'border-rose-200',
    reportBadgeCls: 'bg-rose-100 text-rose-700 border-rose-300',
    fields: [
      { key: 'title',        label: 'Meeting Title', type: 'text', placeholder: 'e.g. Site visit – roof inspection', span: 2 },
      { key: 'meeting_date', label: 'Date',          type: 'date', placeholder: '',                                  span: 1 },
      { key: 'participants', label: 'Participants',  type: 'text', placeholder: 'Names of those present',            span: 2 },
      { key: 'summary',      label: 'Summary',       type: 'text', placeholder: 'Key points and outcomes…',          span: 2 }
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
