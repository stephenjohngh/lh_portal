// parking/stores/waitingListStore.js
// The waiting list's workflow (migration 262): its steps and moves, and the
// item each place is (where it is, its deadline, who it is with). The places
// themselves stay in parkingStore — this store holds only the workflow side.
// The shipped default is saved, and the places already on the list attached,
// the first time an administrator opens Parking → Waiting list.
//
// ⛔ Nothing personal reaches the audit log (the Parking rule): a line names
// "waiting list" and the step, never the person.

import { writable, get } from 'svelte/store';
import { api } from '#lib/utils/api.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { storeLoader } from '#lib/utils/storeLoad.js';
import { loadWorkflow, listItems, saveWorkflow, assignItem, listAssignees } from '#lib/workflow/workflowApi.js';
import { WAITING_LIST_WORKFLOW_KEY, DEFAULT_WAITING_LIST_WORKFLOW } from '../utils/waitingListWorkflow.js';

const AUDIT = { appId: 'parking', eventCategory: 'parking' };

/**
 * @typedef {{ items: any[], workflow: any|null, steps: any[], moves: any[], fields: any[],
 *             loading: boolean, loaded?: boolean, error: string|null }} State
 */

function createWaitingListStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    items: [], workflow: null, steps: [], moves: [], fields: [], loading: false, error: null,
  }));
  const state = () => get({ subscribe });

  const load = storeLoader(update,
    async () => {
      const wf = await loadWorkflow(WAITING_LIST_WORKFLOW_KEY);
      if (!wf) return { workflow: null, steps: [], moves: [], fields: [], items: [] };
      return { ...wf, items: await listItems(wf.workflow.id) };
    },
    (data) => data,
    // A failure stays in this store's `error`, which the Waiting list tab shows:
    // a re-read after a move that succeeded must not read as the move failing.
    { what: 'the waiting list’s workflow', rethrow: false });

  /** Admin: save the shipped workflow, attach the places already on the list, then read. */
  async function setUpWorkflow() {
    await saveWorkflow(DEFAULT_WAITING_LIST_WORKFLOW);
    logAudit('create', 'workflow', null, DEFAULT_WAITING_LIST_WORKFLOW.name, AUDIT);
    await api.rpc('parking_waiting_list_attach_to_workflow', {});
    await load();
  }

  /** The item a place is, or null. @param {string} applicationId */
  function itemFor(applicationId) {
    return state().items.find((i) => i.subject_id === applicationId) ?? null;
  }

  /**
   * Give a place to someone, or to nobody. The audit names the list, not the person.
   * @param {string} applicationId @param {string|null} userId
   */
  async function assign(applicationId, userId) {
    const item = itemFor(applicationId);
    if (!item) throw new Error('This place is not in the workflow.');
    const result = await assignItem(item.id, userId);
    if (result?.changed) {
      logAudit('update', 'parking_application', applicationId, `waiting list — ${userId ? 'assigned' : 'unassigned'}`, AUDIT);
    }
    await load();
    return result;
  }

  /** Who places may be given to. */
  function assignees() {
    const wf = state().workflow;
    return wf ? listAssignees(wf.id) : Promise.resolve([]);
  }

  return { subscribe, load, setUpWorkflow, itemFor, assign, assignees };
}

export const waitingListStore = createWaitingListStore();
