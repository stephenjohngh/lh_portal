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
 * @param {{ key: string, name: string, appId: string, description?: string|null,
 *           steps: import('./workflowModel.js').Step[], moves: import('./workflowModel.js').Move[] }} w
 */
export function saveWorkflow({ key, name, appId, description = null, steps, moves }) {
  return api.rpc('workflow_save', {
    p_key: key, p_name: name, p_app_id: appId, p_description: description,
    p_steps: steps.map((s, i) => ({ key: s.key, name: s.name, public_name: s.public_name ?? null, kind: s.kind, position: i + 1 })),
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
