// parking/stores/requestStore.js
// Online parking applications (migration 247): what was sent on the public
// form, where each is in its workflow, and moving them on. The workflow is the
// shared one (#lib/workflow/), keyed 'parking_application'; the shipped
// default is saved the first time an admin opens the tab (the seed rule).
//
// ⛔ Nothing personal reaches the audit log (the Parking rule): an entry names
// the application by its reference and the step, never the person.

import { writable, get } from 'svelte/store';
import { api } from '#lib/utils/api.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { storeLoader } from '#lib/utils/storeLoad.js';
import { loadWorkflow, listItems, itemHistory, moveItem, saveWorkflow } from '#lib/workflow/workflowApi.js';
import { APPLICATION_WORKFLOW_KEY, DEFAULT_APPLICATION_WORKFLOW } from '../utils/applicationWorkflow.js';

const AUDIT = { appId: 'parking', eventCategory: 'parking' };

/**
 * @typedef {import('#lib/database.types.ts').Tables<'parking_requests'> & Record<string, any>} ParkingRequest
 * @typedef {{ requests: ParkingRequest[], items: any[], workflow: any|null, steps: any[], moves: any[],
 *             loading: boolean, loaded?: boolean, error: string|null }} State
 */

function createRequestStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    requests: [], items: [], workflow: null, steps: [], moves: [], loading: false, error: null,
  }));
  const state = () => get({ subscribe });

  const load = storeLoader(update,
    async () => {
      const wf = await loadWorkflow(APPLICATION_WORKFLOW_KEY);
      if (!wf) return { workflow: null, steps: [], moves: [], items: [], requests: [] };
      const [items, requests] = await Promise.all([
        listItems(wf.workflow.id),
        api.getAll('parking_requests', { orderBy: 'received_at', ascending: false }),
      ]);
      return { ...wf, items, requests };
    },
    (data) => data,
    { what: 'the parking applications' });

  /** Admin: save the shipped workflow when there is none, then read. */
  async function setUpWorkflow() {
    await saveWorkflow(DEFAULT_APPLICATION_WORKFLOW);
    logAudit('create', 'workflow', null, DEFAULT_APPLICATION_WORKFLOW.name, AUDIT);
    await load();
  }

  /** @param {string} itemId */
  function history(itemId) {
    return itemHistory(itemId);
  }

  /**
   * Move an application on. Returns the move's action, if any (the caller
   * re-reads the waiting list when one ran).
   * @param {ParkingRequest} request @param {string} toKey @param {string} [note]
   */
  async function move(request, toKey, note = '') {
    const s = state();
    const item = s.items.find((i) => i.subject_id === request.id);
    if (!item) throw new Error('This application is not in the workflow.');
    const reference = request.reference;                    // captured before the await
    const result = await moveItem(item.id, toKey, note);
    const stepName = s.steps.find((st) => st.key === toKey)?.name ?? toKey;
    logAudit('update', 'parking_request', request.id, `Application ${reference} — ${stepName}`, AUDIT);
    await load();
    return result;
  }

  return { subscribe, load, setUpWorkflow, history, move };
}

export const requestStore = createRequestStore();
