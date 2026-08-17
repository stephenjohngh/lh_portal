// src/lib/apps/building_assets/utils/worksSchedule.js
// What a works-schedule action MEANS — pure, Type-1 testable, no DB.
//
// A works schedule is a named list of components and what should be done to
// each. The interesting half is not building the list; it is what happens when
// the work comes back and somebody says "schedule 12 was carried out". Because
// every item names a real `components.id`, that sentence can update the asset
// records rather than being re-keyed by hand — and this module is where the
// meaning of each action is decided, once.
//
// ── Applying assists, it does not decide ────────────────────────────────────
// Every patch below is a PROPOSAL shown to a person before anything is written.
// The same rule the capital plan runs on (R0: derivation assists, the planner
// decides). An action whose consequence is not obvious — relocate — proposes
// nothing rather than guessing, because a wrong automatic change to an asset
// record is worse than no change at all.

/**
 * The actions a schedule line can carry, in the order they appear in the UI.
 *
 * `applies` is what marking the line carried out does to the component:
 *   status  — the component status to set, or null to leave it alone
 *   retype  — whether the component becomes its target type
 */
export const WORKS_ACTIONS = [
  {
    value: 'replace',
    label: 'Replace',
    // The asset stays; what is in that position changes. Keeping the row means
    // its location, its asset id and its inspection history all survive the
    // replacement, which is the whole reason not to delete and re-create it.
    describe: 'Take out and fit a replacement',
    applies: { status: 'ok', retype: true },
  },
  {
    value: 'remove',
    label: 'Remove',
    // Never deleted. A removed component is evidence that something used to be
    // there, and 'inactive' is the status the portal already uses for it.
    describe: 'Take out and do not replace',
    applies: { status: 'inactive', retype: false },
  },
  {
    value: 'repair',
    label: 'Repair',
    describe: 'Make good in place',
    applies: { status: 'ok', retype: false },
  },
  {
    value: 'relocate',
    label: 'Relocate',
    // Where it moved TO is a position on a plan, which nobody can infer from a
    // schedule. Proposing nothing is the honest answer.
    describe: 'Move to a new position',
    applies: { status: null, retype: false },
  },
  {
    value: 'leave',
    label: 'Leave',
    describe: 'Listed for information; no work',
    applies: { status: null, retype: false },
  },
];

const BY_VALUE = new Map(WORKS_ACTIONS.map(a => [a.value, a]));

/** @param {string} action */
export function actionDef(action) {
  return BY_VALUE.get(action) ?? null;
}

/** @param {string} action */
export function actionLabel(action) {
  return BY_VALUE.get(action)?.label ?? action ?? '—';
}

/**
 * What marking one line carried out would change on its component.
 *
 * Returns `null` when there is nothing to write — a 'leave' line, a 'relocate'
 * line, or a 'replace' whose target type is the type it already is. Returning
 * null rather than an empty object matters: the caller counts what will change,
 * and an empty patch would inflate that count and make the preview lie.
 *
 * @param {object} item      works_schedule_items row
 * @param {object} component the components row it names
 * @param {{ userId: string, at?: string }} ctx
 * @returns {object|null}
 */
export function applyPatch(item, component, { userId, at = new Date().toISOString() } = {}) {
  const def = actionDef(item?.action);
  if (!def || !component) return null;

  const patch = {};

  if (def.applies.status && component.status !== def.applies.status) {
    patch.status         = def.applies.status;
    // Same stamps the inspection path writes, so "who last set this status and
    // when" has one meaning across the app rather than two.
    patch.status_set_by  = userId;
    patch.status_set_at  = at;
  }

  if (def.applies.retype && item.target_type_code
      && item.target_type_code !== component.type_code) {
    patch.type_code = item.target_type_code;
  }

  if (!Object.keys(patch).length) return null;

  patch.updated_by = userId;
  return patch;
}

/**
 * The whole apply, as a plan to show someone BEFORE it is written.
 *
 * @param {object[]} items
 * @param {Map<string, object>|object[]} components
 * @param {{ userId: string, at?: string }} ctx
 * @returns {{ changes: { item: object, component: object, patch: object }[],
 *             unchanged: object[], missing: object[] }}
 */
export function planApply(items = [], components, ctx = {}) {
  const byId = components instanceof Map
    ? components
    : new Map((components ?? []).map(c => [c.id, c]));

  const changes = [];
  const unchanged = [];
  const missing = [];

  for (const item of items) {
    // Already applied lines are skipped, so running the apply twice is safe —
    // work comes back in parts and this will be run more than once.
    if (item.applied_at) continue;

    const component = byId.get(item.component_id);
    if (!component) { missing.push(item); continue; }

    const patch = applyPatch(item, component, ctx);
    if (patch) changes.push({ item, component, patch });
    else unchanged.push(item);
  }

  return { changes, unchanged, missing };
}

/**
 * Counts by action, for the top of the printed document.
 *
 * "Replace 38, Remove 2" is the line a contractor reads first — it is the size
 * of the job before any of the detail.
 *
 * @param {object[]} items
 * @returns {{ action: string, label: string, count: number }[]}
 */
export function actionSummary(items = []) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.action, (counts.get(item.action) ?? 0) + 1);
  }
  return WORKS_ACTIONS
    .filter(a => counts.has(a.value))
    .map(a => ({ action: a.value, label: a.label, count: counts.get(a.value) }));
}

/** "Replace 38 · Remove 2", or a plain statement when there is nothing. */
export function describeSummary(items = []) {
  const parts = actionSummary(items);
  if (!parts.length) return 'No items';
  return parts.map(p => `${p.label} ${p.count}`).join(' · ');
}

/** How much of a schedule has been carried out. */
export function appliedProgress(items = []) {
  const total = items.length;
  const done = items.filter(i => i.applied_at).length;
  return { done, total, complete: total > 0 && done === total };
}

export const SCHEDULE_STATUS = [
  { value: 'draft',     label: 'Draft',     hint: 'Being prepared; not sent' },
  { value: 'issued',    label: 'Issued',    hint: 'Sent to the contractor' },
  { value: 'completed', label: 'Completed', hint: 'Work carried out' },
  { value: 'cancelled', label: 'Cancelled', hint: 'Not proceeding' },
];

export const SCHEDULE_PURPOSE = [
  { value: 'quote', label: 'Request for quotation',
    hint: 'Asking a price for this work' },
  { value: 'works', label: 'Instruction to proceed',
    hint: 'Telling the contractor to carry it out' },
];

/** @param {string} value */
export function purposeLabel(value) {
  return SCHEDULE_PURPOSE.find(p => p.value === value)?.label ?? 'Schedule of works';
}

/** @param {string} value */
export function statusLabel(value) {
  return SCHEDULE_STATUS.find(s => s.value === value)?.label ?? value ?? '—';
}
