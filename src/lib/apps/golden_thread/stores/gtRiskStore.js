// src/lib/apps/golden_thread/stores/gtRiskStore.js
//
// Store for the Golden Thread risk register (Stage D). Factory pattern; all DB
// access via public.js / api.js. Mutators go through run() and resolve to
// { success, error }; loaders throw. The "live" alert signals per risk are
// resolved by batch-reading the linked operational records (MOR, inspections,
// maintenance, documents, actions) — degrades gracefully if a source is
// unavailable, so the register still loads.
//
// ⭐ Since migration 264 a risk MOVES through the shared workflow manager
// ('gt_risk', seeded from utils/gtWorkflow.js): its step is its status, and
// workflow_move() makes the change — one UPDATE of the row, so the
// hash-chained audit records it exactly as before. A note on Close or
// Supersede is kept as the closure or supersession reason.

import { writable } from 'svelte/store';
import { api } from '#lib/utils/api.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { getLogger } from '#lib/utils/logger.js';
import { makeRun, readGtWorkflow, setUpGtWorkflow } from './gtStoreHelpers.js';
import { itemHistory, moveItem, assignItem, listAssignees } from '#lib/workflow/workflowApi.js';
import { DEFAULT_GT_RISK_WORKFLOW, GT_RISK_WORKFLOW_KEY } from '#lib/apps/golden_thread/utils/gtWorkflow.js';
import { riskAlertSignals } from '#lib/apps/golden_thread/utils/gtRiskScoring.js';
import {
  listRisks, getRisk, createRisk, updateRisk,
  listRiskLinks, listAllRiskLinks, addRiskLink, removeRiskLink,
} from '#lib/apps/golden_thread/public.js';
import { storeLoader } from '../../../utils/storeLoad.js';

const logger = getLogger('gtRiskStore');

function createGtRiskStore() {
  const { subscribe, update } = writable({
    risks:        /** @type {any[]} */ ([]),
    selectedRisk: /** @type {any|null} */ (null),
    riskLinks:    /** @type {any[]} */ ([]),      // links for the selected risk
    alertsByRisk: /** @type {Record<string, any>} */ ({}), // riskId → signals
    // ⛔ The live signals could not be worked out, so no risk shows an
    // escalation it may have. Said on screen rather than read as "none".
    alertsUnavailable: false,
    // The risk workflow (264) and its items: where each risk is, and who has it.
    workflow:     /** @type {any|null} */ (null),
    steps:        /** @type {any[]} */ ([]),
    moves:        /** @type {any[]} */ ([]),
    fields:       /** @type {any[]} */ ([]),
    items:        /** @type {any[]} */ ([]),
    loading:      false,
    saving:       false,
    error:        '',
  });

  const run = makeRun(update, logger);

  // -- Live alert resolution --------------------------------------------------
  const toMap = (rows) => new Map((rows ?? []).map((r) => [r.id, r]));

  /** Batch-read the minimal state of every linked operational record.
   *  A source that fails is read as empty so the others still count, and
   *  `failed` says so — an unread source must not pass for "no signal". */
  async function resolveAlerts(links) {
    let failed = false;
    const safe = (p) => p.catch((e) => { failed = true; logger('⚠ alert source failed:', e?.message); return []; });
    const ids = { mor_case: [], component_inspection: [], maintenance_job: [], gt_document: [], action: [] };
    for (const l of links) if (l.target_type in ids) ids[l.target_type].push(l.target_id);
    const uniq = (a) => [...new Set(a)];
    const [mor, insp, maint, docs, acts] = await Promise.all([
      ids.mor_case.length            ? safe(api.getAllIn('mor_cases', 'id', uniq(ids.mor_case), { select: 'id, status' })) : [],
      ids.component_inspection.length ? safe(api.getAllIn('component_inspections', 'id', uniq(ids.component_inspection), { select: 'id, inspection_result' })) : [],
      ids.maintenance_job.length     ? safe(api.getAllIn('maintenance_jobs', 'id', uniq(ids.maintenance_job), { select: 'id, status' })) : [],
      ids.gt_document.length         ? safe(api.getAllIn('gt_documents', 'id', uniq(ids.gt_document), { select: 'id, status, review_due' })) : [],
      ids.action.length              ? safe(api.getAllIn('actions', 'id', uniq(ids.action), { select: 'id, status' })) : [],
    ]);
    return { mor: toMap(mor), insp: toMap(insp), maint: toMap(maint), docs: toMap(docs), acts: toMap(acts), failed };
  }

  /** Per-risk alert signals from resolved records. */
  function alertsFor(links, resolved) {
    const byRisk = {};
    for (const l of links) (byRisk[l.risk_id] ??= []).push(l);
    const out = {};
    for (const [riskId, ls] of Object.entries(byRisk)) {
      const ctx = { morCases: [], inspections: [], maintenance: [], documents: [], actions: [] };
      for (const l of ls) {
        if      (l.target_type === 'mor_case'             && resolved.mor.get(l.target_id))   ctx.morCases.push(resolved.mor.get(l.target_id));
        else if (l.target_type === 'component_inspection' && resolved.insp.get(l.target_id))  ctx.inspections.push(resolved.insp.get(l.target_id));
        else if (l.target_type === 'maintenance_job'      && resolved.maint.get(l.target_id)) ctx.maintenance.push(resolved.maint.get(l.target_id));
        else if (l.target_type === 'gt_document'          && resolved.docs.get(l.target_id))  ctx.documents.push(resolved.docs.get(l.target_id));
        else if (l.target_type === 'action'               && resolved.acts.get(l.target_id))  ctx.actions.push(resolved.acts.get(l.target_id));
      }
      out[riskId] = riskAlertSignals(ctx);
    }
    return out;
  }

  // -- Loaders ----------------------------------------------------------------

  /** Load the full register + all links, and compute per-risk live alerts. */
  const load = storeLoader(update,
    async () => {
      const [risks, links, wf] = await Promise.all([listRisks(), listAllRiskLinks(), readGtWorkflow(GT_RISK_WORKFLOW_KEY)]);
      let alertsByRisk = {};
      let alertsUnavailable = false;
      try {
        const resolved = await resolveAlerts(links);
        alertsByRisk = alertsFor(links, resolved);
        alertsUnavailable = resolved.failed;
      } catch (err) {
        alertsUnavailable = true;
        logger('⚠ alert computation failed:', err?.message);
      }
      return { risks, alertsByRisk, alertsUnavailable, ...wf };
    },
    (data) => data,
    { what: 'the risk register', clearError: '', log: logger });

  /** Load one risk into selectedRisk + its links. */
  async function loadRisk(id) {
    update((s) => ({ ...s, error: '' }));
    try {
      const [risk, riskLinks] = await Promise.all([getRisk(id), listRiskLinks(id)]);
      update((s) => ({ ...s, selectedRisk: risk, riskLinks }));
      return risk;
    } catch (/** @type {any} */ err) {
      update((s) => ({ ...s, error: err.message }));
      throw err;
    }
  }

  async function loadRiskLinks(id) {
    const riskLinks = await listRiskLinks(id);
    update((s) => ({ ...s, riskLinks }));
    return riskLinks;
  }

  // -- Mutators ---------------------------------------------------------------

  async function createRiskEntry(data) {
    return run(async (userId) => {
      const risk = await createRisk(data, userId);
      logAudit('create', 'gt_risk', risk.id, risk.reference, { appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info' });
      await load();
      return { risk };
    });
  }

  async function saveRisk(id, patch) {
    return run(async (userId) => {
      const risk = await updateRisk(id, patch, userId);
      logAudit('update', 'gt_risk', id, risk.reference, { appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info' });
      update((s) => ({ ...s, selectedRisk: s.selectedRisk?.id === id ? risk : s.selectedRisk }));
      return { risk };
    });
  }

  /** Re-read only the workflow's items (after a move or an assignment). */
  async function reloadItems() {
    const wf = await readGtWorkflow(GT_RISK_WORKFLOW_KEY);
    update((s) => ({ ...s, ...wf }));
  }

  /** Admin: save the shipped risk workflow when there is none, attach the register, then read. */
  async function setUpWorkflow() {
    await setUpGtWorkflow(DEFAULT_GT_RISK_WORKFLOW);
    logAudit('create', 'workflow', null, DEFAULT_GT_RISK_WORKFLOW.name, { appId: 'golden_thread', eventCategory: 'golden_thread' });
    await load();
  }

  /** Admin, on opening Golden Thread: set the risk workflow up if there is none. */
  async function ensureWorkflow() {
    const wf = await readGtWorkflow(GT_RISK_WORKFLOW_KEY);
    if (!wf.workflow) await setUpWorkflow();
  }

  /** @param {string} riskId */
  function itemFor(riskId) {
    let item = null;
    update((s) => { item = s.items.find((i) => i.subject_id === riskId) ?? null; return s; });
    if (!item) throw new Error('This risk is not in its workflow yet — an administrator opening Golden Thread sets it up.');
    return /** @type {any} */ (item);
  }

  /**
   * Move a risk on through its workflow. The database sets the status (and the
   * reason, from the note, on Close or Supersede) — one UPDATE, chained in gt_audit.
   * @param {any} risk @param {string} to @param {string} [note]
   */
  async function moveRisk(risk, to, note = '') {
    return run(async () => {
      const item = itemFor(risk.id);
      const from = item.step_key;
      await moveItem(item.id, to, note);
      logAudit('update', 'gt_risk', risk.id, risk.reference, {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info', afterData: { from, to },
      });
      const updated = await getRisk(risk.id);
      update((s) => ({ ...s, selectedRisk: s.selectedRisk?.id === risk.id ? updated : s.selectedRisk }));
      await load();
      return { risk: updated };
    });
  }

  /** Give a risk to someone, or to nobody — the workflow's assignee. */
  async function assign(riskId, userId) {
    return run(async () => {
      const result = await assignItem(itemFor(riskId).id, userId || null);
      await reloadItems();
      return { changed: !!result?.changed };
    });
  }

  /** Who a risk may be given to. */
  function assignees() {
    let wf = null;
    update((s) => { wf = s.workflow; return s; });
    return wf ? listAssignees(/** @type {any} */ (wf).id) : Promise.resolve([]);
  }

  /** One item's history (for the printable record). @param {string} itemId */
  function history(itemId) {
    return itemHistory(itemId);
  }

  async function addLink(riskId, link) {
    return run(async (userId) => {
      await addRiskLink(riskId, link, userId);
      await loadRiskLinks(riskId);
    });
  }

  async function removeLink(linkId, riskId) {
    return run(async () => {
      await removeRiskLink(linkId);
      await loadRiskLinks(riskId);
    });
  }

  function clearError() { update((s) => ({ ...s, error: '' })); }
  function clearSelected() { update((s) => ({ ...s, selectedRisk: null, riskLinks: [] })); }

  return {
    subscribe,
    load,
    loadRisk,
    loadRiskLinks,
    createRisk: createRiskEntry,
    saveRisk,
    setUpWorkflow,
    ensureWorkflow,
    reloadItems,
    moveRisk,
    assign,
    assignees,
    history,
    addLink,
    removeLink,
    clearError,
    clearSelected,
  };
}

export const gtRiskStore = createGtRiskStore();
