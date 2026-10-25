// src/lib/workflow/workflowApi.js
//
// Reading and changing workflows and their items (migration 247). Workflow
// tables are shared infrastructure, like document_library, so they have this
// utils module rather than an app's public.js. ⛔ Items move ONLY through
// moveItem() (workflow_move() in the database), and a workflow is saved only
// whole, through saveWorkflow() (workflow_save(), admin) — the tables take no
// direct writes.

import { api } from '#lib/utils/api.js';

/**
 * A workflow by its key, with its steps and moves; null when it is not set up.
 * @param {string} key
 */
export async function loadWorkflow(key) {
  const rows = await api.get('workflows', { filters: { key }, limit: 1 });
  const workflow = rows[0] ?? null;
  if (!workflow) return null;
  const [steps, moves, fields] = await Promise.all([
    api.get('workflow_steps', { filters: { workflow_id: workflow.id }, orderBy: 'position', ascending: true }),
    api.get('workflow_moves', { filters: { workflow_id: workflow.id }, orderBy: 'position', ascending: true }),
    // A Cases process's fields (migration 253); none for the others.
    api.get('workflow_fields', { filters: { workflow_id: workflow.id }, orderBy: 'position', ascending: true }),
  ]);
  return { workflow, steps, moves, fields };
}

/** Every workflow, for Admin. */
export function listWorkflows() {
  return api.getAll('workflows', { orderBy: 'name', ascending: true });
}

/**
 * Save a workflow whole (admin). Steps keep their keys; moves are replaced.
 * ⛔ A change to a workflow marked as needing a full review is refused by the
 * database unless `review` says who reviewed it and what against.
 * @param {{ key: string, name: string, appId: string, description?: string|null,
 *           steps: import('./workflowModel.js').Step[], moves: import('./workflowModel.js').Move[],
 *           reviewRequired?: boolean, reviewReason?: string|null,
 *           review?: { reviewedBy: string, reviewedAgainst: string, note?: string|null } | null,
 *           fields?: import('./workflowModel.js').Field[], expectedUpdatedAt?: string|null }} w
 *   fields — the process's fields (migration 253); undefined leaves them as they are
 *   expectedUpdatedAt — the workflow's updated_at when it was read: the save is
 *     refused if someone else saved since (migration 254); null skips the check
 */
export function saveWorkflow({ key, name, appId, description = null, steps, moves,
  reviewRequired = undefined, reviewReason = null, review = null, fields = undefined, expectedUpdatedAt = null }) {
  return api.rpc('workflow_save', {
    p_key: key, p_name: name, p_app_id: appId, p_description: description,
    // The review mark (migration 249): undefined keeps it as it is.
    p_review_required: reviewRequired === undefined ? null : !!reviewRequired,
    p_review_reason: reviewReason || null,
    // For a CHANGE to a marked workflow: who reviewed it and against what.
    p_review: review ? { reviewed_by: review.reviewedBy, reviewed_against: review.reviewedAgainst, note: review.note ?? null } : null,
    p_steps: steps.map((s, i) => ({ key: s.key, name: s.name, public_name: s.public_name ?? null, kind: s.kind, position: i + 1,
      deadline_days: s.deadline_days === '' || s.deadline_days == null ? null : Number(s.deadline_days),
      deadline_basis: s.deadline_basis ?? 'calendar', deadline_from: s.deadline_from ?? 'entered',
      // Pause, sign-offs and escalation (migration 267).
      pauses_clock: !!s.pauses_clock, signoffs: (s.signoffs ?? []).map((x) => ({ key: x.key, label: x.label })),
      escalate_after_days: s.escalate_after_days === '' || s.escalate_after_days == null ? null : Number(s.escalate_after_days),
      escalate_to: s.escalate_to || null })),
    p_moves: moves.map((m, i) => ({
      from_key: m.from_key, to_key: m.to_key, label: m.label,
      note_required: !!m.note_required, admin_only: !!m.admin_only, action: m.action || null,
      who: m.who || 'anyone', four_eyes: !!m.four_eyes, required_fields: m.required_fields ?? [], position: i + 1,
      // Timers (migration 259): the system makes the move after N days in its step.
      timer_days: m.timer_days === '' || m.timer_days == null ? null : Number(m.timer_days),
      timer_basis: m.timer_basis ?? 'calendar',
      needs_signoffs: !!m.needs_signoffs,
    })),
    p_fields: fields === undefined ? null : fields.map((f, i) => ({
      key: f.key, label: f.label, type: f.type, options: (f.options ?? []).map(String).filter((o) => o.trim()),
      help: f.help || null, required_on_create: !!f.required_on_create, position: i + 1,
    })),
    p_expected_updated_at: expectedUpdatedAt || null,
  });
}

/**
 * Change an item's field values (migration 254): only the fields given, a
 * null clearing one. The database checks each against its field and keeps the
 * change in the item's history.
 * @param {string} itemId @param {Record<string, string|null>} changes
 * @returns {Promise<{ fields: Record<string, any>, changed: boolean }>}
 */
export function setItemFields(itemId, changes) {
  return api.rpc('workflow_set_fields', { p_item: itemId, p_fields: changes });
}

/**
 * Every workflow's steps and items, for the overview across all processes
 * (what the viewer's own grants let them read).
 * @returns {Promise<{ steps: any[], items: any[] }>}
 */
export async function listOverviewData() {
  const [steps, items] = await Promise.all([
    api.getAll('workflow_steps', { orderBy: 'key', tiebreak: false }),
    api.getAll('workflow_items', { orderBy: 'created_at' }),
  ]);
  return { steps, items };
}

/**
 * The sign-offs given on an item in its current step (migration 267).
 * @param {string} itemId
 * @returns {Promise<Array<{ step_key: string, key: string, signed_by: string|null, at: string, note: string|null }>>}
 */
export function listSignoffs(itemId) {
  return api.get('workflow_signoffs', { filters: { item_id: itemId } });
}

/** Give one of the step's sign-offs. @param {string} itemId @param {string} key @param {string} [note] */
export function giveSignoff(itemId, key, note = '') {
  return api.rpc('workflow_signoff', { p_item: itemId, p_key: key, p_note: note || null });
}

/** Take back a sign-off you gave. @param {string} itemId @param {string} key */
export function withdrawSignoff(itemId, key) {
  return api.rpc('workflow_signoff_withdraw', { p_item: itemId, p_key: key });
}

/** A workflow's items (each names its subject by id). @param {string} workflowId */
export function listItems(workflowId) {
  return api.getAll('workflow_items', { filters: { workflow_id: workflowId }, orderBy: 'created_at' });
}

/** One item's history, oldest first. @param {string} itemId */
export function itemHistory(itemId) {
  return api.get('workflow_events', { filters: { item_id: itemId }, orderBy: 'at', ascending: true });
}

/**
 * Move an item along a defined move, running its action. Throws the
 * database's reason when the move is not allowed.
 * @param {string} itemId @param {string} toKey @param {string} [note]
 * @returns {Promise<{ step: string, action: string|null }>}
 */
export function moveItem(itemId, toKey, note = '') {
  return api.rpc('workflow_move', { p_item: itemId, p_to: toKey, p_note: note || null });
}

/**
 * Open items with a deadline in a workflow, for the Planner (through the
 * owning app's public.js, so its grant gates them): the item's label (never a
 * person), its step and when it is due.
 * @param {string} workflowKey
 * @returns {Promise<Array<{ id: string, label: string|null, due_on: string, step: string, workflow: string }>>}
 */
export async function listDeadlines(workflowKey) {
  const wf = await loadWorkflow(workflowKey);
  if (!wf) return [];
  const open = new Set(wf.steps.filter((s) => s.kind === 'start' || s.kind === 'open').map((s) => s.key));
  const name = new Map(wf.steps.map((s) => [s.key, s.name]));
  const items = await api.getAll('workflow_items', { filters: { workflow_id: wf.workflow.id }, orderBy: 'created_at' });
  return items
    .filter((i) => i.due_on && open.has(i.step_key))
    .map((i) => ({ id: i.id, label: i.label, due_on: i.due_on, step: name.get(i.step_key) ?? i.step_key, workflow: wf.workflow.name }));
}

/**
 * Give an item to someone, or to nobody (null) — migration 250. The database
 * checks the caller may edit the workflow's app and that the person could work
 * the item; the change is kept in the item's history.
 * @param {string} itemId @param {string|null} userId @param {string} [note]
 * @returns {Promise<{ assigned_to: string|null, changed: boolean }>}
 */
export function assignItem(itemId, userId, note = '') {
  return api.rpc('workflow_assign', { p_item: itemId, p_to: userId, p_note: note || null });
}

/**
 * Who may be given a workflow's items: administrators and holders of its
 * app's editable grant.
 * @param {string} workflowId @returns {Promise<Array<{ id: string, full_name: string|null }>>}
 */
export async function listAssignees(workflowId) {
  return (await api.rpc('workflow_assignees', { p_workflow: workflowId })) ?? [];
}

/** A workflow's change history, newest first (admin). @param {string} workflowId */
export function listChanges(workflowId) {
  return api.getAll('workflow_changes', { filters: { workflow_id: workflowId }, orderBy: 'changed_at', ascending: false });
}

/**
 * Every move made in a workflow, oldest first — its event log, for the
 * diagram's figures (workflowStats.js).
 * @param {string} workflowId
 */
export async function listEvents(workflowId) {
  const items = await listItems(workflowId);
  if (!items.length) return { items, events: [] };
  const events = await api.getAllIn('workflow_events', 'item_id', items.map((i) => i.id), { orderBy: 'at' });
  return { items, events };
}

/**
 * When an item's timed move falls due (migration 259) — the day the nightly
 * run makes it — or null when its step has no timer. The database counts it,
 * as it counts deadlines (working days skip the non-working days).
 * @param {string} itemId @returns {Promise<string|null>}
 */
export async function timerDue(itemId) {
  return (await api.rpc('workflow_timer_due', { p_item: itemId })) ?? null;
}

/** The latest runs of the timers (admin): when, how many moved, what failed. */
export function listTimerRuns(count = 5) {
  return api.get('workflow_timer_runs', { orderBy: 'ran_at', ascending: false, limit: count });
}

/** Run the timers now (admin) — what the nightly job does. */
export function runTimers() {
  return api.rpc('workflow_run_timers', {});
}

/**
 * Switch a workflow's public status page on or off (migration 261, admin).
 * A workflow marked for review needs the review recorded, as a save does.
 * @param {string} key @param {boolean} on
 * @param {{ reviewedBy: string, reviewedAgainst: string, note?: string|null } | null} [review]
 */
export function setPublicStatus(key, on, review = null) {
  return api.rpc('workflow_set_public', {
    p_key: key, p_on: !!on,
    p_review: review ? { reviewed_by: review.reviewedBy, reviewed_against: review.reviewedAgainst, note: review.note ?? null } : null,
  });
}

/**
 * Retire a Cases process — no new cases; those it has stay and can be finished —
 * or bring it back (migration 265, admin). A marked one needs the review.
 * @param {string} key @param {boolean} retire
 * @param {{ reviewedBy: string, reviewedAgainst: string, note?: string|null } | null} [review]
 */
export function retireWorkflow(key, retire, review = null) {
  return api.rpc('workflow_retire', { p_key: key, p_retire: !!retire, p_review: reviewArg(review) });
}

/**
 * Delete a Cases process with no cases (migration 265, admin). Its change
 * history is kept, ending "Deleted". A marked one needs the review.
 * @param {string} key
 * @param {{ reviewedBy: string, reviewedAgainst: string, note?: string|null } | null} [review]
 */
export function deleteWorkflow(key, review = null) {
  return api.rpc('workflow_delete', { p_key: key, p_review: reviewArg(review) });
}

/** @param {{ reviewedBy: string, reviewedAgainst: string, note?: string|null } | null} review */
function reviewArg(review) {
  return review ? { reviewed_by: review.reviewedBy, reviewed_against: review.reviewedAgainst, note: review.note ?? null } : null;
}

/**
 * The deleted processes, newest first, each with its kept change history
 * (admin) — the rows whose workflow is gone (migration 265).
 * @returns {Promise<Array<{ key: string, name: string, deletedAt: string, changes: any[] }>>}
 */
export async function listDeletedWorkflows() {
  const deletions = await api.getAll('workflow_changes', { filters: { event: 'deleted' }, orderBy: 'changed_at', ascending: false });
  const out = [];
  for (const d of deletions) {
    const rows = await api.getAll('workflow_changes', { filters: { workflow_key: d.workflow_key }, orderBy: 'changed_at', ascending: false });
    // A later process may reuse the key: only rows whose workflow is gone, up to this deletion.
    const changes = rows.filter((r) => r.workflow_id == null && r.changed_at <= d.changed_at
      && !deletions.some((o) => o !== d && o.workflow_key === d.workflow_key && o.changed_at < d.changed_at && r.changed_at <= o.changed_at));
    out.push({ key: d.workflow_key, name: d.workflow_name ?? d.workflow_key, deletedAt: d.changed_at, changes });
  }
  return out;
}
