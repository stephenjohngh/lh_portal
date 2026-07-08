// src/lib/apps/golden_thread/stores/gtRiskStore.js
//
// Store for the Golden Thread risk register (Stage D). Factory pattern; all DB
// access via public.js / api.js. Mutators go through run() and resolve to
// { success, error }; loaders throw. The "live" alert signals per risk are
// resolved by batch-reading the linked operational records (MOR, inspections,
// maintenance, documents, actions) — degrades gracefully if a source is
// unavailable, so the register still loads.

import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';
import { makeRun } from './gtStoreHelpers.js';
import { isValidRiskTransition } from '$lib/apps/golden_thread/utils/gtRiskLifecycle.js';
import { riskAlertSignals } from '$lib/apps/golden_thread/utils/gtRiskScoring.js';
import {
  listRisks, getRisk, createRisk, updateRisk,
  listRiskLinks, listAllRiskLinks, addRiskLink, removeRiskLink,
} from '$lib/apps/golden_thread/public.js';

const logger = getLogger('gtRiskStore');

function createGtRiskStore() {
  const { subscribe, update } = writable({
    risks:        /** @type {any[]} */ ([]),
    selectedRisk: /** @type {any|null} */ (null),
    riskLinks:    /** @type {any[]} */ ([]),      // links for the selected risk
    alertsByRisk: /** @type {Record<string, any>} */ ({}), // riskId → signals
    loading:      false,
    saving:       false,
    error:        '',
  });

  const run = makeRun(update, logger);

  // -- Live alert resolution --------------------------------------------------
  const toMap = (rows) => new Map((rows ?? []).map((r) => [r.id, r]));
  const safe  = (p) => p.catch((e) => { logger('⚠ alert source (non-fatal):', e?.message); return []; });

  /** Batch-read the minimal state of every linked operational record. */
  async function resolveAlerts(links) {
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
    return { mor: toMap(mor), insp: toMap(insp), maint: toMap(maint), docs: toMap(docs), acts: toMap(acts) };
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
  async function load() {
    update((s) => ({ ...s, loading: true, error: '' }));
    try {
      const [risks, links] = await Promise.all([listRisks(), listAllRiskLinks()]);
      let alertsByRisk = {};
      try {
        const resolved = await resolveAlerts(links);
        alertsByRisk = alertsFor(links, resolved);
      } catch (err) {
        logger('⚠ alert computation failed (non-fatal):', err?.message);
      }
      update((s) => ({ ...s, risks, alertsByRisk, loading: false }));
      return risks;
    } catch (err) {
      update((s) => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }

  /** Load one risk into selectedRisk + its links. */
  async function loadRisk(id) {
    update((s) => ({ ...s, error: '' }));
    try {
      const [risk, riskLinks] = await Promise.all([getRisk(id), listRiskLinks(id)]);
      update((s) => ({ ...s, selectedRisk: risk, riskLinks }));
      return risk;
    } catch (err) {
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

  /** Drive a lifecycle transition, guarded client-side by the same table the DB enforces. */
  async function transitionRisk(risk, toStatus, extra = {}) {
    return run(async (userId) => {
      if (!isValidRiskTransition(risk.status, toStatus)) {
        throw new Error(`Invalid risk status transition: ${risk.status} → ${toStatus}`);
      }
      const updated = await updateRisk(risk.id, { status: toStatus, ...extra }, userId);
      logAudit('update', 'gt_risk', risk.id, risk.reference, {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info',
        afterData: { from: risk.status, to: toStatus, ...extra },
      });
      update((s) => ({ ...s, selectedRisk: s.selectedRisk?.id === risk.id ? updated : s.selectedRisk }));
      await load();
      return { risk: updated };
    });
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
    transitionRisk,
    addLink,
    removeLink,
    clearError,
    clearSelected,
  };
}

export const gtRiskStore = createGtRiskStore();
