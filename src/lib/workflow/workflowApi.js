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
  const [steps, moves] = await Promise.all([
    api.get('workflow_steps', { filters: { workflow_id: workflow.id }, orderBy: 'position', ascending: true }),
    api.get('workflow_moves', { filters: { workflow_id: workflow.id }, orderBy: 'position', ascending: true }),
  ]);
  return { workflow, steps, moves };
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
 *           review?: { reviewedBy: string, reviewedAgainst: string, note?: string|null } | null }} w
 */
export function saveWorkflow({ key, name, appId, description = null, steps, moves,
  reviewRequired = undefined, reviewReason = null, review = null }) {
  return api.rpc('workflow_save', {
    p_key: key, p_name: name, p_app_id: appId, p_description: description,
    // The review mark (migration 249): undefined keeps it as it is.
    p_review_required: reviewRequired === undefined ? null : !!reviewRequired,
    p_review_reason: reviewReason || null,
    // For a CHANGE to a marked workflow: who reviewed it and against what.
    p_review: review ? { reviewed_by: review.reviewedBy, reviewed_against: review.reviewedAgainst, note: review.note ?? null } : null,
    p_steps: steps.map((s, i) => ({ key: s.key, name: s.name, public_name: s.public_name ?? null, kind: s.kind, position: i + 1,
      deadline_days: s.deadline_days === '' || s.deadline_days == null ? null : Number(s.deadline_days),
      deadline_basis: s.deadline_basis ?? 'calendar', deadline_from: s.deadline_from ?? 'entered' })),
    p_moves: moves.map((m, i) => ({
      from_key: m.from_key, to_key: m.to_key, label: m.label,
      note_required: !!m.note_required, admin_only: !!m.admin_only, action: m.action || null, position: i + 1,
    })),
  });
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

/** A workflow's change history, newest first (admin). @param {string} workflowId */
export function listChanges(workflowId) {
  return api.getAll('workflow_changes', { filters: { workflow_id: workflowId }, orderBy: 'changed_at', ascending: false });
}
