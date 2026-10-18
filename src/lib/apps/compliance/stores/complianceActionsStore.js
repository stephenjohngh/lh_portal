// src/lib/apps/compliance/stores/complianceActionsStore.js
//
// The register's OUTSTANDING ACTIONS on the shared workflow manager (W3,
// migrations 255–256). The actions themselves are register rows — this store
// holds only their workflow: where each one is (its step IS its action
// status), its deadline (its own due date), who it is with, and its history.
//
// ⭐ Owner, technical authority and due date stay the REGISTER's columns,
// because the obligations statement prints them. They are set through
// compliance_action_set_details(), never through the register's edit(): an
// assignment is a fact about this building, not a change to the catalogue, so
// it must not mark a shipped row as "edited here" (which would stop a later
// release's correction reaching it).

import { writable, get } from 'svelte/store';
import { api } from '#lib/utils/api.js';
import { getLogger } from '#lib/utils/logger.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { storeLoader } from '#lib/utils/storeLoad.js';
import { errMessage } from '#lib/utils/errors.js';
import { loadWorkflow, listItems, moveItem, saveWorkflow, assignItem, listAssignees } from '#lib/workflow/workflowApi.js';
import { ensureNonWorkingDays } from '#lib/workflow/nonWorkingDays.js';
import { statutoryRegister } from '#lib/stores/statutoryRegister.js';
import { COMPLIANCE_ACTION_WORKFLOW_KEY, DEFAULT_COMPLIANCE_ACTION_WORKFLOW } from '../utils/complianceActionWorkflow.js';

const logger = getLogger('complianceActionsStore');

/**
 * @typedef {{ workflow: any|null, steps: any[], moves: any[], fields: any[], items: any[],
 *             assignees: Array<{ id: string, full_name: string|null }>,
 *             loading: boolean, loaded: boolean, error: string|null }} State
 */

function createComplianceActionsStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    workflow: null, steps: [], moves: [], fields: [], items: [], assignees: [],
    loading: false, loaded: false, error: null,
  }));

  async function readWorkflow() {
    const wf = await loadWorkflow(COMPLIANCE_ACTION_WORKFLOW_KEY);
    if (!wf) return { workflow: null, steps: [], moves: [], fields: [], items: [], assignees: [] };
    const [items, assignees] = await Promise.all([listItems(wf.workflow.id), listAssignees(wf.workflow.id)]);
    return { ...wf, items, assignees };
  }

  const load = storeLoader(update, readWorkflow, (data) => data,
    { what: 'the actions’ workflow', log: logger });

  /** Re-read the items only (after a move, an assignment or a due date). */
  async function reloadItems() {
    const wf = /** @type {any} */ (get({ subscribe })).workflow;
    if (!wf) return load();
    const items = await listItems(wf.id);
    update(s => ({ ...s, items }));
  }

  /**
   * Admin, on first opening the actions: save the shipped workflow when there
   * is none (the seed rule — a release never overwrites one already saved),
   * attach the actions already in the register, then read.
   */
  async function setUpWorkflow() {
    await ensureNonWorkingDays();
    await saveWorkflow(DEFAULT_COMPLIANCE_ACTION_WORKFLOW);
    const attached = await api.rpc('compliance_action_attach_to_workflow', {});
    logAudit('create', 'workflow', null, DEFAULT_COMPLIANCE_ACTION_WORKFLOW.name, {
      appId: 'compliance', eventCategory: 'compliance', afterData: { attached },
    });
    await load();
  }

  /** The workflow item of the register row with this id, or null. @param {string} subjectId */
  function itemFor(subjectId) {
    return get({ subscribe }).items.find(i => i.subject_id === subjectId) ?? null;
  }

  /**
   * Move an action on. The database writes the step reached back as its status
   * and refuses a status changed any other way.
   * @param {{ key: string, name: string }} action @param {string} itemId
   * @param {string} to @param {string} [note]
   */
  async function move(action, itemId, to, note = '') {
    const result = await moveItem(itemId, to, note);
    logAudit('update', 'compliance_action', action.key, action.name, {
      appId: 'compliance', eventCategory: 'compliance', afterData: { status: to },
    });
    await Promise.all([reloadItems(), statutoryRegister.load()]);
    return result;
  }

  /** Give an action to someone, or to nobody. @param {string} itemId @param {string|null} userId */
  async function assign(itemId, userId) {
    const result = await assignItem(itemId, userId || null);
    await reloadItems();
    return result;
  }

  /**
   * Owner, technical authority and due date, together.
   * @param {{ key: string, name: string }} action
   * @param {{ owner?: string|null, technicalAuthority?: string|null, dueDate?: string|null }} details
   */
  async function setDetails(action, { owner = null, technicalAuthority = null, dueDate = null }) {
    update(s => ({ ...s, error: null }));
    try {
      const result = await api.rpc('compliance_action_set_details', {
        p_key: action.key,
        p_owner: owner || null,
        p_technical_authority: technicalAuthority || null,
        p_due_date: dueDate || null,
      });
      if (result?.changed) {
        logAudit('update', 'compliance_action', action.key, action.name, {
          appId: 'compliance', eventCategory: 'compliance', afterData: { changed: result.fields },
        });
      }
      await Promise.all([reloadItems(), statutoryRegister.load()]);
      return result;
    } catch (/** @type {any} */ err) {
      logger('❌ setDetails', err);
      update(s => ({ ...s, error: errMessage(err) }));
      throw err;
    }
  }

  function clearError() {
    update(s => ({ ...s, error: null }));
  }

  return { subscribe, load, reloadItems, setUpWorkflow, itemFor, move, assign, setDetails, clearError };
}

export const complianceActionsStore = createComplianceActionsStore();
