// src/lib/workflow/workflowModel.js
//
// The workflow manager's rules, pure (2026-10-17, migration 247). A workflow
// is STEPS — a key, a name for staff, a name the public may see, a kind — and
// the MOVES allowed between them. The database holds the same rules
// (workflow_save() and workflow_move()) and is the copy that enforces them;
// this one says why before anything is pressed, the portal's "two copies"
// decision (CLAUDE.md, standing decisions).

import { actionsFor } from './workflowActions.js';

/** @typedef {'start'|'open'|'done'|'declined'} StepKind */
/** @typedef {{ key: string, name: string, public_name?: string|null, kind: StepKind, position?: number,
 *              deadline_days?: number|null, deadline_basis?: 'calendar'|'working', deadline_from?: 'entered'|'started' }} Step */
/** @typedef {{ from_key: string, to_key: string, label: string, note_required?: boolean, admin_only?: boolean, action?: string|null, position?: number }} Move */

/** The kinds of step — the database's CHECK list, with the words shown. */
export const STEP_KINDS = Object.freeze([
  { value: 'start',    label: 'Start',                 explains: 'Where every new item begins. Exactly one.' },
  { value: 'open',     label: 'In progress',           explains: 'Being worked on.' },
  { value: 'done',     label: 'Finished — accepted',   explains: 'A finished step; an action may run on the way in.' },
  { value: 'declined', label: 'Finished — not accepted', explains: 'A finished step: declined, withdrawn or similar.' },
]);
export const STEP_KIND_LABEL = Object.fromEntries(STEP_KINDS.map((k) => [k.value, k.label]));

/** Is a step of this kind finished (nothing moves on from it)? @param {string} kind */
export function isFinished(kind) {
  return kind === 'done' || kind === 'declined';
}

/** A key for a new step from its name: lower case, underscores, unique among `taken`. */
export function stepKeyFor(/** @type {string} */ name, /** @type {string[]} */ taken = []) {
  let base = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
  if (!/^[a-z]/.test(base)) base = `step_${base}`.replace(/_+$/, '');
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}

/**
 * The problem with saving this workflow, or null — the same checks as
 * workflow_save(), in the same order, worded for a person.
 * @param {{ steps: Step[], moves: Move[], appId: string }} def
 */
export function workflowProblem({ steps, moves, appId }) {
  const starts = steps.filter((s) => s.kind === 'start');
  if (starts.length !== 1) return `A workflow needs exactly one start step (it has ${starts.length}).`;
  const keys = new Set();
  for (const s of steps) {
    if (s.deadline_days != null && s.deadline_days !== '') {
      const n = Number(s.deadline_days);
      if (!Number.isInteger(n) || n < 1 || n > 365) return `Step "${s.name}": a deadline is 1 to 365 days.`;
      if (isFinished(s.kind)) return `Step "${s.name}" is finished, so it has no deadline.`;
    }
    if (!['calendar', 'working'].includes(s.deadline_basis ?? 'calendar') || !['entered', 'started'].includes(s.deadline_from ?? 'entered')) {
      return `Step "${s.name}": a deadline counts calendar or working days, from entering the step or from the start.`;
    }
    if (!String(s.name ?? '').trim()) return 'Every step needs a name.';
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(s.key ?? '')) return `Step "${s.name}" has a key that cannot be used.`;
    if (keys.has(s.key)) return `Two steps share the key "${s.key}".`;
    keys.add(s.key);
  }
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const pairs = new Set();
  for (const m of moves) {
    if (!byKey.has(m.from_key) || !byKey.has(m.to_key)) return 'A move refers to a step that is not in the workflow.';
    if (m.from_key === m.to_key) return `The move "${m.label}" goes nowhere — its from and to are the same step.`;
    if (!String(m.label ?? '').trim()) return 'Every move needs a button label.';
    const pair = `${m.from_key}>${m.to_key}`;
    if (pairs.has(pair)) return `There are two moves from "${byKey.get(m.from_key)?.name}" to "${byKey.get(m.to_key)?.name}".`;
    pairs.add(pair);
    if (isFinished(byKey.get(m.from_key)?.kind ?? '')) {
      return `Step "${m.from_key}" is finished, so nothing can move on from it.`;
    }
    if (m.action) {
      if (!actionsFor(appId).some((a) => a.key === m.action)) return `The action "${m.action}" is not one this app offers.`;
      if (byKey.get(m.to_key)?.kind !== 'done') {
        return `The move "${m.label}" runs an action, so it must lead to a finished (accepted) step.`;
      }
    }
  }
  // Every step reachable from the start.
  const reached = new Set([starts[0].key]);
  for (let grew = true; grew;) {
    grew = false;
    for (const m of moves) {
      if (reached.has(m.from_key) && !reached.has(m.to_key)) { reached.add(m.to_key); grew = true; }
    }
  }
  const lost = steps.find((s) => !reached.has(s.key));
  if (lost) return `Step "${lost.key}" cannot be reached from the start.`;
  return null;
}

/**
 * The moves a viewer may make from a step, in the workflow's order.
 * @param {Move[]} moves @param {string} stepKey
 * @param {{ isAdmin?: boolean, canEdit?: boolean }} viewer
 */
export function movesFrom(moves, stepKey, { isAdmin = false, canEdit = false } = {}) {
  if (!isAdmin && !canEdit) return [];
  return moves
    .filter((m) => m.from_key === stepKey && (isAdmin || !m.admin_only))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** Steps in their order. @param {Step[]} steps */
export function orderedSteps(steps) {
  return [...steps].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}
