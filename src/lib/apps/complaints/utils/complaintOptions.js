// src/lib/apps/complaints/utils/complaintOptions.js
// The picklists, in one place so the form and the case view cannot drift.
// Every value here must exist in migration 187's CHECK constraints.

/**
 * What the complaint is about.
 *
 * `out_of_scope` is a category rather than only a flag, so the queue can set it
 * aside without a second field doing the same job differently. The flag still
 * exists because scope is a decision that needs a rationale (§1 of the design).
 */
export const CATEGORIES = [
  { value: 'fire_safety', label: 'Fire safety',
    hint: 'Fire spread, doors, alarms, escape routes' },
  { value: 'structural',  label: 'Structural',
    hint: 'The structural integrity of the building' },
  { value: 'ap_duties',   label: 'How we are managing building safety',
    hint: "The accountable person's performance of their duties" },
  { value: 'out_of_scope', label: 'Not a building-safety complaint',
    hint: 'Noise, cleaning, service charge — recorded, then redirected' },
];

/** The three in-scope categories, for the form's default guidance. */
export const IN_SCOPE_CATEGORIES = CATEGORIES.filter(c => c.value !== 'out_of_scope');

/** How it reached us. MOR's list, so the two read alike. */
export const CHANNELS = [
  { value: 'staff_logged', label: 'Logged by staff' },
  { value: 'email',        label: 'Email' },
  { value: 'phone',        label: 'Phone' },
  { value: 'in_person',    label: 'In person' },
  { value: 'paper',        label: 'Letter' },
  { value: 'online',       label: 'Online form' },
];

/**
 * Who complained.
 *
 * `unknown` is a real answer, not a missing one — somebody who insists on
 * anonymity is recorded here deliberately, with the contact left blank, so it
 * is a visible state rather than an accident (§7.3 of the design).
 */
export const COMPLAINANT_TYPES = [
  { value: 'resident', label: 'Resident' },
  { value: 'owner',    label: 'Leaseholder / owner' },
  { value: 'other',    label: 'Someone else' },
  { value: 'unknown',  label: 'Not given' },
];

export const OUTCOMES = [
  { value: 'upheld',         label: 'Upheld' },
  { value: 'partly_upheld',  label: 'Partly upheld' },
  { value: 'not_upheld',     label: 'Not upheld' },
  { value: 'redirected',     label: 'Redirected — not building safety' },
  { value: 'withdrawn',      label: 'Withdrawn' },
];

/** Never blank at a render site. */
const labelFrom = (list, value, fallback) =>
  list.find(o => o.value === value)?.label ?? (value || fallback);

export const categoryLabel  = (v) => labelFrom(CATEGORIES, v, 'Uncategorised');
export const channelLabel   = (v) => labelFrom(CHANNELS, v, 'Unknown');
export const complainantLabel = (v) => labelFrom(COMPLAINANT_TYPES, v, 'Not given');
export const outcomeLabel   = (v) => labelFrom(OUTCOMES, v, '—');

/** For `FormSelect`, which wants `{ value, label }` and its own placeholder. */
export const asOptions = (list) => list.map(({ value, label }) => ({ value, label }));
