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
/** @typedef {{ from_key: string, to_key: string, label: string, note_required?: boolean, admin_only?: boolean, action?: string|null, who?: string, four_eyes?: boolean, position?: number }} Move */

/** The kinds of step — the database's CHECK list, with the words shown. */
export const STEP_KINDS = Object.freeze([
  { value: 'start',    label: 'Start',                 explains: 'Where every new item begins. Exactly one.' },
  { value: 'open',     label: 'In progress',           explains: 'Being worked on.' },
  { value: 'done',     label: 'Finished — accepted',   explains: 'A finished step; an action may run on the way in.' },
  { value: 'declined', label: 'Finished — not accepted', explains: 'A finished step: declined, withdrawn or similar.' },
]);
export const STEP_KIND_LABEL = Object.fromEntries(STEP_KINDS.map((k) => [k.value, k.label]));

/**
 * Who may make a move (migration 251): anyone who can edit the app, or only
 * the person the item is with. ⛔ Like four-eyes, it binds administrators too.
 */
export const MOVE_WHO = Object.freeze([
  { value: 'anyone',   label: 'Anyone who can edit' },
  { value: 'assignee', label: 'Only the person it is with' },
]);

/**
 * Why THIS person cannot make this move now, or null — the database's own
 * conditions (workflow_move(), migration 251), said before anything is
 * pressed. admin_only and the grant are filtered out earlier (movesFrom).
 * @param {Move} m
 * @param {{ userId?: string|null, assignedTo?: string|null, lastMoverId?: string|null }} ctx
 *   lastMoverId — who made the item's last MOVE (an assignment is not one)
 */
export function moveRefusal(m, { userId = null, assignedTo = null, lastMoverId = null } = {}) {
  if ((m.who ?? 'anyone') === 'assignee') {
    if (!assignedTo) return 'Give it to someone first: only the person it is with can do this.';
    if (assignedTo !== userId) return 'Only the person it is with can do this.';
  }
  if (m.four_eyes && lastMoverId && lastMoverId === userId) {
    return 'Someone other than the person who made the last move must do this.';
  }
  return null;
}

/**
 * What a history row records (migration 250): a MOVE between steps, or an
 * ASSIGN — who the item is with changed, the step did not. ⚠ Anything that
 * counts moves (the diagram's figures, how long an item sat in a step) reads
 * moves only; a row from before 250 has no kind and is a move.
 */
export const EVENT_KINDS = Object.freeze([
  { value: 'move',   label: 'Moved' },
  { value: 'assign', label: 'Assigned' },
]);
/** @param {{ kind?: string|null }} e */
export const isMoveEvent = (e) => (e.kind ?? 'move') === 'move';

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
    if (!['anyone', 'assignee'].includes(m.who ?? 'anyone')) {
      return `The move "${m.label}": who may make it is anyone who can edit, or only the person it is with.`;
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

// ── The review mark and change history (migration 249) ────────────────────

/**
 * A workflow's definition in the shape the database keeps and compares
 * (workflow_definition()): what a save changed is the difference of two.
 * @param {{ name: string, description?: string|null, reviewRequired?: boolean, reviewReason?: string|null,
 *           steps: Step[], moves: Move[] }} w
 */
export function definitionOf({ name, description = null, reviewRequired = false, reviewReason = null, steps, moves }) {
  const n = (/** @type {any} */ v) => (v === '' || v === undefined ? null : v);
  return {
    name, description: n(description), review_required: !!reviewRequired, review_reason: reviewRequired ? n(reviewReason) : null,
    steps: steps.map((s) => ({ key: s.key, name: s.name, public_name: n(s.public_name), kind: s.kind,
      deadline_days: s.deadline_days === '' || s.deadline_days == null ? null : Number(s.deadline_days),
      deadline_basis: s.deadline_basis ?? 'calendar', deadline_from: s.deadline_from ?? 'entered' })),
    moves: moves.map((m) => ({ from_key: m.from_key, to_key: m.to_key, label: m.label, note_required: !!m.note_required,
      admin_only: !!m.admin_only, action: n(m.action), who: m.who ?? 'anyone', four_eyes: !!m.four_eyes })),
  };
}

/** Has anything that a save would keep changed? @param {any} a @param {any} b */
export function definitionChanged(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/**
 * What changed between two kept definitions, in words, for the history.
 * @param {any} before  null for a new workflow
 * @param {any} after
 * @returns {string[]}
 */
export function workflowDiff(before, after) {
  if (!before) return ['Set up.'];
  /** @type {string[]} */
  const out = [];
  const deadline = (/** @type {any} */ s) => (s?.deadline_days
    ? `${s.deadline_days} ${s.deadline_basis === 'working' ? 'working' : 'calendar'} days from ${s.deadline_from === 'started' ? 'the start' : 'reaching it'}`
    : 'none');
  if (before.name !== after.name) out.push(`Renamed “${before.name}” → “${after.name}”.`);
  if (before.review_required !== after.review_required) {
    out.push(after.review_required ? `Marked as needing a full review: ${after.review_reason}.` : 'Review mark removed.');
  } else if (after.review_required && before.review_reason !== after.review_reason) {
    out.push(`Review reason: “${before.review_reason}” → “${after.review_reason}”.`);
  }
  const bSteps = new Map((before.steps ?? []).map((/** @type {any} */ s) => [s.key, s]));
  const aSteps = new Map((after.steps ?? []).map((/** @type {any} */ s) => [s.key, s]));
  for (const [k, s] of aSteps) {
    const was = bSteps.get(k);
    if (!was) { out.push(`Step added: “${s.name}” (${STEP_KIND_LABEL[s.kind] ?? s.kind}).`); continue; }
    if (was.name !== s.name) out.push(`Step “${was.name}” renamed “${s.name}”.`);
    if ((was.public_name ?? null) !== (s.public_name ?? null)) out.push(`Step “${s.name}”: the name the public sees is now “${s.public_name ?? s.name}”.`);
    if (was.kind !== s.kind) out.push(`Step “${s.name}”: ${STEP_KIND_LABEL[was.kind] ?? was.kind} → ${STEP_KIND_LABEL[s.kind] ?? s.kind}.`);
    if (deadline(was) !== deadline(s)) out.push(`Step “${s.name}” deadline: ${deadline(was)} → ${deadline(s)}.`);
  }
  for (const [k, s] of bSteps) if (!aSteps.has(k)) out.push(`Step removed: “${s.name}”.`);
  const mk = (/** @type {any} */ m) => `${m.from_key}>${m.to_key}`;
  const name = (/** @type {string} */ k) => aSteps.get(k)?.name ?? bSteps.get(k)?.name ?? k;
  const bMoves = new Map((before.moves ?? []).map((/** @type {any} */ m) => [mk(m), m]));
  const aMoves = new Map((after.moves ?? []).map((/** @type {any} */ m) => [mk(m), m]));
  for (const [k, m] of aMoves) {
    const was = bMoves.get(k);
    const where = `${name(m.from_key)} → ${name(m.to_key)}`;
    if (!was) { out.push(`Move added: “${m.label}” (${where}).`); continue; }
    if (was.label !== m.label) out.push(`Move ${where}: button “${was.label}” → “${m.label}”.`);
    if (was.note_required !== m.note_required) out.push(`Move “${m.label}”: ${m.note_required ? 'now needs a note' : 'no longer needs a note'}.`);
    if (was.admin_only !== m.admin_only) out.push(`Move “${m.label}”: ${m.admin_only ? 'now admin only' : 'no longer admin only'}.`);
    if ((was.who ?? 'anyone') !== (m.who ?? 'anyone')) {
      out.push(`Move “${m.label}”: ${(m.who ?? 'anyone') === 'assignee' ? 'now only the person it is with' : 'now anyone who can edit'}.`);
    }
    if (!!was.four_eyes !== !!m.four_eyes) {
      out.push(`Move “${m.label}”: ${m.four_eyes ? 'now four-eyes — not the person who made the last move' : 'no longer four-eyes'}.`);
    }
    if ((was.action ?? null) !== (m.action ?? null)) out.push(`Move “${m.label}”: action ${was.action ?? 'none'} → ${m.action ?? 'none'}.`);
  }
  for (const [k, m] of bMoves) if (!aMoves.has(k)) out.push(`Move removed: “${m.label}” (${name(m.from_key)} → ${name(m.to_key)}).`);
  return out.length ? out : ['Nothing that is kept changed.'];
}
