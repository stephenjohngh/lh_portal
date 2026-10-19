// src/lib/apps/cases/stores/casesStore.js
//
// Generic cases (migration 253): the processes an administrator set up in
// Admin → Workflows (workflows whose app is 'cases'), and the cases in the one
// being looked at. A case moves only through its workflow item
// (#lib/workflow/), which carries its step, deadline and who it is with.
//
// ⛔ The audit log names a case by its REFERENCE only — a title or a field may
// name a person. Deleting a case (admin) deletes its attached documents FIRST
// and keeps the case if any cannot go (the portal's file rule).

import { writable, get } from 'svelte/store';
import { api } from '#lib/utils/api.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { storeLoader } from '#lib/utils/storeLoad.js';
import { requireUserId } from '#lib/utils/currentUser.js';
import { deleteDocumentsFor } from '#lib/utils/documentApi.js';
import { loadWorkflow, listItems, itemHistory, moveItem, assignItem, listAssignees } from '#lib/workflow/workflowApi.js';

const AUDIT = { appId: 'cases', eventCategory: 'cases' };

/**
 * @typedef {import('#lib/database.types.ts').Tables<'cases'> & Record<string, any>} CaseRow
 * @typedef {{ processes: any[], chosen: string, workflow: any|null, steps: any[], moves: any[], fields: any[],
 *             items: any[], cases: CaseRow[], loading: boolean, loaded?: boolean, error: string|null }} State
 */

function createCasesStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    processes: [], chosen: '', workflow: null, steps: [], moves: [], fields: [], items: [], cases: [],
    loading: false, error: null,
  }));
  const state = () => get({ subscribe });

  /** One process: its definition, its items and its cases. @param {string} key */
  async function readProcess(key) {
    const wf = await loadWorkflow(key);
    if (!wf) return { chosen: key, workflow: null, steps: [], moves: [], fields: [], items: [], cases: [] };
    const [items, cases] = await Promise.all([
      listItems(wf.workflow.id),
      api.getAll('cases', { filters: { workflow_id: wf.workflow.id }, orderBy: 'created_at', ascending: false }),
    ]);
    return { chosen: key, ...wf, items, cases };
  }

  /** The processes, then the chosen one (the first, or the one asked for). */
  const load = storeLoader(update,
    async (/** @type {string|undefined} */ key) => {
      const processes = await api.getAll('workflows', { filters: { app_id: 'cases' }, orderBy: 'name', ascending: true });
      // A retired process (migration 265) is chosen only when asked for by name.
      const chosen = key && processes.some((p) => p.key === key) ? key
        : (processes.find((p) => !p.retired_at)?.key ?? processes[0]?.key ?? '');
      if (!chosen) return { processes, chosen: '', workflow: null, steps: [], moves: [], fields: [], items: [], cases: [] };
      return { processes, ...(await readProcess(chosen)) };
    },
    (data) => data,
    { what: 'the cases' });

  /** Re-read the process being looked at (after a change). */
  function reload() {
    return load(state().chosen || undefined);
  }

  /**
   * Open a case (migration 254, case_open()): the database checks the fields
   * needed to open one and every value, puts the case at the process's start
   * step and the values on its item.
   * @param {{ title: string, description?: string|null, fields: Record<string, string|null> }} data
   * @returns {Promise<{ id: string, reference: string }>}
   */
  async function create(data) {
    const wf = state().workflow;
    if (!wf) throw new Error('Choose a process first.');
    const row = await api.rpc('case_open', {
      p_workflow: wf.id, p_title: data.title.trim(), p_description: data.description?.trim() || null, p_fields: data.fields,
    });
    logAudit('create', 'case', row.id, row.reference, { ...AUDIT, afterData: { reference: row.reference, process: wf.key } });
    await reload();
    return row;
  }

  /** Edit a case's title and description — never its process or reference (field values are the item's). */
  async function save(/** @type {CaseRow} */ c, /** @type {{ title: string, description?: string|null }} */ data) {
    const reference = c.reference;                    // captured before the await
    await api.update('cases', c.id, {
      title: data.title.trim(), description: data.description?.trim() || null, updated_by: await requireUserId(),
    });
    logAudit('update', 'case', c.id, reference, { ...AUDIT, afterData: { reference } });
    await reload();
  }

  /** Admin: delete a case — its documents first, kept if any cannot go. */
  async function remove(/** @type {CaseRow} */ c) {
    const { id, reference } = c;                      // captured before the await
    await deleteDocumentsFor('case', id);
    await api.delete('cases', id);
    logAudit('delete', 'case', id, reference, { ...AUDIT, severity: 'warning', beforeData: { reference } });
    await reload();
  }

  /** The workflow item of a case. @param {string} caseId */
  function itemOf(caseId) {
    return state().items.find((i) => i.subject_id === caseId) ?? null;
  }

  /** Move a case on, through its workflow. */
  async function move(/** @type {CaseRow} */ c, /** @type {string} */ toKey, note = '') {
    const item = itemOf(c.id);
    if (!item) throw new Error('This case is not in its process.');
    const reference = c.reference;                    // captured before the await
    const result = await moveItem(item.id, toKey, note);
    const stepName = state().steps.find((st) => st.key === toKey)?.name ?? toKey;
    logAudit('update', 'case', c.id, `${reference} — ${stepName}`, AUDIT);
    await reload();
    return result;
  }

  /** Give a case to someone, or to nobody. */
  async function assign(/** @type {CaseRow} */ c, /** @type {string|null} */ userId) {
    const item = itemOf(c.id);
    if (!item) throw new Error('This case is not in its process.');
    const reference = c.reference;
    const result = await assignItem(item.id, userId);
    if (result?.changed) logAudit('update', 'case', c.id, `${reference} — ${userId ? 'assigned' : 'unassigned'}`, AUDIT);
    await reload();
    return result;
  }

  /** Who the process's cases may be given to. */
  function assignees() {
    const wf = state().workflow;
    return wf ? listAssignees(wf.id) : Promise.resolve([]);
  }

  /** One case's history. @param {string} itemId */
  function history(itemId) {
    return itemHistory(itemId);
  }

  return { subscribe, load, reload, create, save, remove, move, assign, assignees, history };
}

export const casesStore = createCasesStore();
