// src/lib/workflow/workflowModel.js
//
// The workflow manager's rules, pure (2026-10-17, migration 247). A workflow
// is STEPS — a key, a name for staff, a name the public may see, a kind — and
// the MOVES allowed between them. The database holds the same rules
// (workflow_save() and workflow_move()) and is the copy that enforces them;
// this one says why before anything is pressed, the portal's "two copies"
// decision (CLAUDE.md, standing decisions).

import { actionsFor } from './workflowActions.js';
import { contractProblem } from './workflowContracts.js';

/** @typedef {'start'|'open'|'done'|'declined'} StepKind */
/** @typedef {{ key: string, name: string, public_name?: string|null, kind: StepKind, position?: number,
 *              deadline_days?: number|null, deadline_basis?: 'calendar'|'working', deadline_from?: 'entered'|'started' }} Step */
/** @typedef {{ from_key: string, to_key: string, label: string, note_required?: boolean, admin_only?: boolean, action?: string|null, who?: string, four_eyes?: boolean, required_fields?: string[], timer_days?: number|string|null, timer_basis?: string, position?: number }} Move */
/** @typedef {{ key: string, label: string, type: string, options?: string[], help?: string|null, required_on_create?: boolean, position?: number }} Field */

/** The kinds of step — the database's CHECK list, with the words shown. */
export const STEP_KINDS = Object.freeze([
  { value: 'start',    label: 'Start',                 explains: 'Where every new item begins. Exactly one.' },
  { value: 'open',     label: 'In progress',           explains: 'Being worked on.' },
  { value: 'done',     label: 'Finished — accepted',   explains: 'A finished step; an action may run on the way in.' },
  { value: 'declined', label: 'Finished — not accepted', explains: 'A finished step: declined, withdrawn or similar.' },
]);
export const STEP_KIND_LABEL = Object.fromEntries(STEP_KINDS.map((k) => [k.value, k.label]));

/**
 * The kinds of field a process can have (migration 253; any process since
 * 254 — the values are the item's). The last three
 * LINK to something in the portal: a component, a space, a portal user.
 * ⛔ A person is a PORTAL USER (staff, a contractor account) — never a
 * resident; the resident-data rule.
 */
export const FIELD_TYPES = Object.freeze([
  { value: 'text',      label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'date',      label: 'Date' },
  { value: 'number',    label: 'Number' },
  { value: 'yes_no',    label: 'Yes / no' },
  { value: 'choice',    label: 'Choice from a list' },
  { value: 'component', label: 'A component' },
  { value: 'space',     label: 'A space' },
  { value: 'person',    label: 'A portal user' },
]);
export const FIELD_TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));

/** Is a field's value missing — the database's test (blank text counts as missing). @param {any} v */
export const fieldMissing = (v) => v == null || String(v).trim() === '';

/**
 * Who may make a move (migration 251): anyone who can edit the app, or only
 * the person the item is with. ⛔ Like four-eyes, it binds administrators too.
 */
export const MOVE_WHO = Object.freeze([
  { value: 'anyone',   label: 'Anyone who can edit' },
  { value: 'assignee', label: 'Only the person it is with' },
]);

/**
 * The apps whose items the PUBLIC can look up (migration 261,
 * workflow_public_allowed): their items are named by a reference somebody
 * outside holds — PKR-…, CMP-…, CAS-…. An action (A1), a works schedule or a
 * job (named by its title) is not.
 */
export const PUBLIC_STATUS_APPS = Object.freeze(['parking', 'complaints', 'cases']);

/** Workflows of those apps whose items carry no such reference (migration 262): a waiting-list place. */
export const NOT_PUBLIC_KEYS = Object.freeze(['parking_waiting_list']);

/** Can this workflow's public status page be switched on? @param {string} appId @param {string} key */
export function publicStatusAllowed(appId, key) {
  return PUBLIC_STATUS_APPS.includes(appId) && !NOT_PUBLIC_KEYS.includes(key);
}

/** The word the public sees for a step with no public name of its own — the database's own (workflow_public_status). */
export const PUBLIC_KIND_WORD = Object.freeze({ start: 'Received', open: 'Being dealt with', done: 'Finished', declined: 'Closed' });

/** What the public status page says for a step. @param {{ public_name?: string|null, kind: string }} step */
export function publicStageName(step) {
  const own = String(step.public_name ?? '').trim();
  return own || PUBLIC_KIND_WORD[/** @type {keyof typeof PUBLIC_KIND_WORD} */ (step.kind)] || 'Closed';
}

/** How a timer counts its days — held to workflow_moves' CHECK by dbRulesParity.test.js. */
export const TIMER_BASES = ['calendar', 'working', 'deadline'];

/** How a timer counts, in words for the editor. 'deadline' (migration 262) counts days after the item's deadline. */
export const TIMER_BASIS_LABEL = Object.freeze({ calendar: 'days in its step', working: 'working days in its step', deadline: 'days after its deadline' });

/**
 * Why THIS person cannot make this move now, or null — the database's own
 * conditions (workflow_move(), migration 251), said before anything is
 * pressed. admin_only and the grant are filtered out earlier (movesFrom).
 * @param {Move} m
 * @param {{ userId?: string|null, assignedTo?: string|null, lastMoverId?: string|null,
 *           fields?: Field[], values?: Record<string, any> }} ctx
 *   lastMoverId — who made the item's last MOVE (an assignment is not one);
 *   fields / values — a Cases process's fields and the case's values (migration 253)
 */
export function moveRefusal(m, { userId = null, assignedTo = null, lastMoverId = null, fields = [], values = {} } = {}) {
  if ((m.who ?? 'anyone') === 'assignee') {
    if (!assignedTo) return 'Give it to someone first: only the person it is with can do this.';
    if (assignedTo !== userId) return 'Only the person it is with can do this.';
  }
  if (m.four_eyes && lastMoverId && lastMoverId === userId) {
    return 'Someone other than the person who made the last move must do this.';
  }
  // The fields this move needs filled (migration 253), in the process's order.
  const needed = new Set(m.required_fields ?? []);
  const empty = [...fields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .find((f) => needed.has(f.key) && fieldMissing(values?.[f.key]));
  if (empty) return `Fill in "${empty.label}" first.`;
  return null;
}

/**
 * What a history row records (migration 250): a MOVE between steps, an
 * ASSIGN — who the item is with changed, the step did not — or (254) FIELDS,
 * its field values changed, the note naming which. ⚠ Anything that
 * counts moves (the diagram's figures, how long an item sat in a step) reads
 * moves only; a row from before 250 has no kind and is a move.
 */
/**
 * What a change-history row records when it is not a definition change
 * (migration 265, workflow_changes.event): a Cases process retired, brought
 * back, or deleted. The database's CHECK holds the same values.
 */
export const CHANGE_EVENTS = Object.freeze([
  { value: 'retired',      label: 'Retired: no new cases.' },
  { value: 'brought_back', label: 'Brought back: cases can be opened again.' },
  { value: 'deleted',      label: 'Deleted.' },
]);

export const EVENT_KINDS = Object.freeze([
  { value: 'move',   label: 'Moved' },
  { value: 'assign', label: 'Assigned' },
  { value: 'fields', label: 'Fields changed' },
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
 * @param {{ steps: Step[], moves: Move[], appId: string, key?: string, fields?: Field[] }} def
 */
export function workflowProblem({ steps, moves, appId, key = '', fields = [] }) {
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
  // A Cases process's fields (migration 253).
  const fieldKeys = new Set();
  for (const f of fields) {
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(f.key ?? '')) return `A field has a key that cannot be used ("${f.key ?? ''}").`;
    if (fieldKeys.has(f.key)) return `Two fields share the key "${f.key}".`;
    fieldKeys.add(f.key);
    if (!String(f.label ?? '').trim()) return `Every field needs a label ("${f.key}" has none).`;
    if (!FIELD_TYPES.some((t) => t.value === f.type)) return `The field "${f.label}" has a type that is not offered.`;
    if (f.type === 'choice' && !(f.options ?? []).some((o) => String(o).trim())) return `The choice field "${f.label}" needs at least one choice.`;
    if (f.required_on_create && appId !== 'cases') {
      return `The field "${f.label}": only a Cases process is opened with a form, so only its fields can be needed to open one.`;
    }
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
    // A move OUT of a finished step is allowed (migration 252): a reopen. The
    // item is open again and its deadline counted afresh.
    if ((m.required_fields ?? []).some((k) => !fieldKeys.has(k))) {
      return `The move "${m.label}" needs a field the process does not have.`;
    }
    if (!['anyone', 'assignee'].includes(m.who ?? 'anyone')) {
      return `The move "${m.label}": who may make it is anyone who can edit, or only the person it is with.`;
    }
    // Timers (migration 259): a move the system makes by itself after N days.
    if (m.timer_days != null && m.timer_days !== '') {
      const n = Number(m.timer_days);
      if (!Number.isInteger(n) || n < 1 || n > 365) return `The move "${m.label}": a timer is 1 to 365 days.`;
      if (m.action) return `The move "${m.label}" runs an action, so it cannot be made by a timer — a person must make it.`;
      if (isFinished(byKey.get(m.from_key)?.kind)) return `The move "${m.label}" leaves a finished step, so it cannot be made by a timer.`;
    }
    if (!TIMER_BASES.includes(m.timer_basis ?? 'calendar')) {
      return `The move "${m.label}": a timer counts calendar or working days in its step, or days after its deadline.`;
    }
    if (m.action) {
      if (!actionsFor(appId).some((a) => a.key === m.action)) return `The action "${m.action}" is not one this app offers.`;
      if (byKey.get(m.to_key)?.kind !== 'done') {
        return `The move "${m.label}" runs an action, so it must lead to a finished (accepted) step.`;
      }
    }
  }
  // Only one move out of a step may happen by itself.
  const timed = new Map();
  for (const m of moves.filter((x) => x.timer_days != null && x.timer_days !== '')) {
    if (timed.has(m.from_key)) return `Step "${byKey.get(m.from_key)?.name}" has more than one move with a timer — only one can happen by itself.`;
    timed.set(m.from_key, m);
  }
  // A move out of a finished step is a reopen (252) — but not out of a step
  // reached by an action, which cannot be undone (254).
  const outOfAction = moves.find((m) => moves.some((a) => a.to_key === m.from_key && a.action));
  if (outOfAction) {
    return `Step "${byKey.get(outOfAction.from_key)?.name}" is reached by a move that runs an action, which cannot be undone, so no move may lead out of it.`;
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
  // What the owning app needs the workflow to keep (254).
  return contractProblem(appId, { steps, moves }, key);
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
 *           steps: Step[], moves: Move[], fields?: Field[] }} w
 */
/** A move's timer in words: "30 working days". @param {{ timer_days?: any, timer_basis?: string }} m */
export function timerWords(m) {
  const n = Number(m.timer_days);
  return `${n} ${m.timer_basis === 'working' ? 'working ' : ''}day${n === 1 ? '' : 's'}`;
}

/** When a timed move happens, in words: "after 30 working days in its step", "1 day after its deadline". @param {{ timer_days?: any, timer_basis?: string }} m */
export function timerPhrase(m) {
  return m.timer_basis === 'deadline' ? `${timerWords(m)} after its deadline` : `after ${timerWords(m)} in its step`;
}

export function definitionOf({ name, description = null, reviewRequired = false, reviewReason = null, steps, moves, fields = [] }) {
  const n = (/** @type {any} */ v) => (v === '' || v === undefined ? null : v);
  return {
    name, description: n(description), review_required: !!reviewRequired, review_reason: reviewRequired ? n(reviewReason) : null,
    steps: steps.map((s) => ({ key: s.key, name: s.name, public_name: n(s.public_name), kind: s.kind,
      deadline_days: s.deadline_days === '' || s.deadline_days == null ? null : Number(s.deadline_days),
      deadline_basis: s.deadline_basis ?? 'calendar', deadline_from: s.deadline_from ?? 'entered' })),
    moves: moves.map((m) => ({ from_key: m.from_key, to_key: m.to_key, label: m.label, note_required: !!m.note_required,
      admin_only: !!m.admin_only, action: n(m.action), who: m.who ?? 'anyone', four_eyes: !!m.four_eyes,
      required_fields: [...(m.required_fields ?? [])],
      timer_days: m.timer_days === '' || m.timer_days == null ? null : Number(m.timer_days),
      timer_basis: m.timer_basis ?? 'calendar' })),
    fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: (f.options ?? []).map(String),
      help: n(f.help), required_on_create: !!f.required_on_create })),
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
  // The public status page (migration 261), switched on or off on its own.
  if (!!before.public_status !== !!after.public_status) {
    out.push(after.public_status ? 'Public status page switched on: anyone with an item’s reference and code can see its step at /status.'
      : 'Public status page switched off.');
  }
  if (before.review_required !== after.review_required) {
    out.push(after.review_required ? `Marked as needing a full review: ${after.review_reason}.` : 'Review mark removed.');
  } else if (after.review_required && before.review_reason !== after.review_reason) {
    out.push(`Review reason: “${before.review_reason}” → “${after.review_reason}”.`);
  }
  const bSteps = new Map((before.steps ?? []).map((/** @type {any} */ s) => [s.key, s]));
  const aSteps = new Map((after.steps ?? []).map((/** @type {any} */ s) => [s.key, s]));
  for (const [k, s] of aSteps) {
    const was = bSteps.get(k);
    if (!was) {
      // A new step's deadline is part of what was added (it went unsaid until 2026-10-20).
      const due = deadline(s) === 'none' ? '' : ` — deadline ${deadline(s)}`;
      out.push(`Step added: “${s.name}” (${STEP_KIND_LABEL[s.kind] ?? s.kind})${due}.`);
      continue;
    }
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
    if (!was) {
      const extras = [m.note_required && 'needs a note', m.admin_only && 'admin only', (m.who ?? 'anyone') === 'assignee' && 'only the person it is with',
        m.four_eyes && 'four-eyes', m.action && `action ${m.action}`, m.timer_days && `by itself ${timerPhrase(m)}`,
        (m.required_fields ?? []).length && `needs ${(m.required_fields ?? []).map((/** @type {string} */ k) => after.fields?.find((/** @type {any} */ f) => f.key === k)?.label ?? k).join(', ')} filled`].filter(Boolean);
      out.push(`Move added: “${m.label}” (${where})${extras.length ? ` — ${extras.join('; ')}` : ''}.`);
      continue;
    }
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
    if ((was.timer_days ?? null) !== (m.timer_days ?? null) || (was.timer_days && (was.timer_basis ?? 'calendar') !== (m.timer_basis ?? 'calendar'))) {
      out.push(`Move “${m.label}”: ${m.timer_days ? `now made by itself ${timerPhrase(m)}` : 'no longer made by itself'}.`);
    }
  }
  for (const [k, m] of bMoves) if (!aMoves.has(k)) out.push(`Move removed: “${m.label}” (${name(m.from_key)} → ${name(m.to_key)}).`);
  // Fields (migration 253) — and which a move needs filled.
  const bFields = new Map((before.fields ?? []).map((/** @type {any} */ f) => [f.key, f]));
  const aFields = new Map((after.fields ?? []).map((/** @type {any} */ f) => [f.key, f]));
  const fieldName = (/** @type {string} */ k) => aFields.get(k)?.label ?? bFields.get(k)?.label ?? k;
  for (const [k, f] of aFields) {
    const was = bFields.get(k);
    if (!was) { out.push(`Field added: “${f.label}” (${FIELD_TYPE_LABEL[f.type] ?? f.type}${f.required_on_create ? ', needed to open a case' : ''}).`); continue; }
    if (was.label !== f.label) out.push(`Field “${was.label}” renamed “${f.label}”.`);
    if (was.type !== f.type) out.push(`Field “${f.label}”: ${FIELD_TYPE_LABEL[was.type] ?? was.type} → ${FIELD_TYPE_LABEL[f.type] ?? f.type}.`);
    if (JSON.stringify(was.options ?? []) !== JSON.stringify(f.options ?? [])) out.push(`Field “${f.label}”: choices now ${(f.options ?? []).join(', ') || 'none'}.`);
    if (!!was.required_on_create !== !!f.required_on_create) out.push(`Field “${f.label}”: ${f.required_on_create ? 'now needed to open a case' : 'no longer needed to open a case'}.`);
    if ((was.help ?? null) !== (f.help ?? null)) out.push(`Field “${f.label}”: help text changed.`);
  }
  for (const [k, f] of bFields) if (!aFields.has(k)) out.push(`Field removed: “${f.label}” (what items hold in it is kept).`);
  for (const [k, m] of aMoves) {
    const was = bMoves.get(k);
    if (!was) continue;
    const a = [...(m.required_fields ?? [])].sort().join(','), b = [...(was.required_fields ?? [])].sort().join(',');
    if (a !== b) out.push(`Move “${m.label}”: ${a ? `needs ${(m.required_fields ?? []).map(fieldName).join(', ')} filled` : 'needs no fields filled'}.`);
  }
  return out.length ? out : ['Nothing that is kept changed.'];
}
