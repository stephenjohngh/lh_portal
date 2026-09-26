// src/lib/apps/parking/stores/parkingStore.js
// Parking: the bay register (P0) and who holds each bay (P1).
// docs/requirements/unbuilt/Parking_App_Design.md.
//
// Reads the DRAWN bays through Building Assets' public.js (they are that app's
// records) and floors and plans directly (shared reference data, which any app
// may read). Owns and writes parking_bays, parking_holders, parking_agreements
// and parking_vehicles — all gated on the `parking` grant at RLS.
//
// Every write is checked by the same pure rules the database enforces
// (utils/agreementModel.js, utils/bayModel.js), so a refusal arrives as a
// sentence before anything is sent.

import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { auth } from '$lib/stores/auth';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';
import { listParkingBaySpaces } from '$lib/apps/building_assets/public.js';
import { mergeBays, bayFactsRow, validateBayFacts, BAY_DEFAULTS } from '../utils/bayModel.js';
import {
  validateHolder, holderRow, validateAgreement, agreementRow, canTransition,
  normaliseReg, validateVehicle, findByRegistration, todayISO,
} from '../utils/agreementModel.js';

const logger = getLogger('Parking');
const AUDIT = { appId: 'parking', eventCategory: 'parking' };

/**
 * @typedef {Record<string, any>} Row
 * @typedef {{
 *   bays: Row[], floors: Row[], plans: Row[],
 *   holders: Row[], agreements: Row[], vehicles: Row[],
 *   loading: boolean, error: string|null
 * }} State
 */

function requireUserId() {
  const id = get(auth).user?.id;
  if (!id) throw new Error('Not authenticated');
  return id;
}

function createParkingStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    bays: [], floors: [], plans: [], holders: [], agreements: [], vehicles: [],
    loading: false, error: null,
  }));
  const state = () => get({ subscribe });

  // Kept so a write can re-merge without re-reading every table.
  let spaces = [];
  let rows = [];

  function remerge() {
    update(s => ({ ...s, bays: mergeBays(spaces, rows, s.floors, s.plans, s.agreements) }));
  }

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const [bs, pb, floors, plans, holders, agreements, vehicles] = await Promise.all([
        listParkingBaySpaces(),
        api.get('parking_bays'),
        api.get('floors', { orderBy: 'level_order', ascending: true }),
        api.get('plans', { select: 'id, name, floor_id, image_url, image_aspect_ratio, scale_ref' }),
        api.getAll('parking_holders', { orderBy: 'display_name' }),
        api.getAll('parking_agreements', { orderBy: 'reference' }),
        api.getAll('parking_vehicles', { orderBy: 'registration' }),
      ]);
      spaces = bs; rows = pb;
      update(s => ({ ...s, floors, plans, holders, agreements, vehicles, loading: false,
        bays: mergeBays(spaces, rows, floors, plans, agreements) }));
    } catch (/** @type {any} */ err) {
      logger('load failed:', err.message);
      update(s => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }

  // ── Bays ─────────────────────────────────────────────────────────────────

  /**
   * Save a bay's parking facts. The first save creates the row, keyed on the
   * drawn space; later saves update it.
   */
  async function saveBay(spaceId, facts) {
    const problem = validateBayFacts(facts);
    if (problem) throw new Error(problem);
    const userId = requireUserId();

    const before = rows.find(r => r.space_id === spaceId) ?? null;
    const row = {
      ...bayFactsRow(facts),
      space_id: spaceId,
      updated_by: userId,
      updated_at: new Date().toISOString(),
      ...(before ? {} : { created_by: userId }),
    };
    const saved = await api.upsert('parking_bays', row, { onConflict: 'space_id' });
    rows = before ? rows.map(r => r.space_id === spaceId ? saved : r) : [...rows, saved];
    remerge();

    const ref = state().bays.find(b => b.space_id === spaceId)?.ref ?? spaceId;
    logAudit(before ? 'update' : 'create', 'parking_bay', saved.id, ref,
      { ...AUDIT, beforeData: before ?? undefined, afterData: saved });
    return saved;
  }

  /**
   * The bay's parking row, creating it with the defaults if the bay has only
   * ever been drawn. An agreement references the row, so allocating a bay
   * nobody has configured must not fail for that reason.
   */
  async function ensureBayRow(spaceId) {
    const existing = rows.find(r => r.space_id === spaceId);
    if (existing) return existing;
    return saveBay(spaceId, { ...BAY_DEFAULTS });
  }

  // ── Holders ──────────────────────────────────────────────────────────────

  async function saveHolder(id, fields) {
    const problem = validateHolder(fields);
    if (problem) throw new Error(problem);
    const userId = requireUserId();
    const row = { ...holderRow(fields), updated_by: userId, updated_at: new Date().toISOString() };

    const saved = id
      ? await api.update('parking_holders', id, row, true)
      : await api.create('parking_holders', { ...row, created_by: userId }, true);
    update(s => ({
      ...s,
      holders: id ? s.holders.map(h => h.id === id ? saved : h) : [...s.holders, saved]
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    }));
    // ⚠ Audit the change, never the personal details: a holder's name and
    // address in the portal-wide audit log would copy them out of the one
    // place the `parking` grant protects.
    logAudit(id ? 'update' : 'create', 'parking_holder', saved.id, 'holder', {
      ...AUDIT, afterData: { holder_type: saved.holder_type, fields_changed: Object.keys(row) },
    });
    return saved;
  }

  // ── Agreements ───────────────────────────────────────────────────────────

  /**
   * Create an agreement as a DRAFT, with its vehicles. A draft holds the bay
   * against overlap; activating it is a separate, deliberate step.
   */
  async function createAgreement(spaceId, holderId, terms, vehicles = []) {
    const s = state();
    const bay = s.bays.find(b => b.space_id === spaceId);
    const holder = s.holders.find(h => h.id === holderId);
    if (!bay) throw new Error('That bay is not in the register.');
    const problem = validateAgreement(terms, bay, holder, s.agreements);
    if (problem) throw new Error(problem);
    const userId = requireUserId();

    const bayRow = await ensureBayRow(spaceId);
    const saved = await api.create('parking_agreements', {
      ...agreementRow(terms), bay_id: bayRow.id, holder_id: holderId, status: 'draft',
      created_by: userId, updated_by: userId,
    }, true);
    update(st => ({ ...st, agreements: [...st.agreements, saved] }));

    for (const v of vehicles) {
      if (normaliseReg(v.registration)) await addVehicle(saved.id, v);
    }
    remerge();
    logAudit('create', 'parking_agreement', saved.id, saved.reference,
      { ...AUDIT, afterData: { reference: saved.reference, bay: bay.ref, basis: saved.basis, starts_on: saved.starts_on } });
    return saved;
  }

  /** Change an agreement's terms. Its bay, holder and status are not terms. */
  async function updateAgreement(id, terms) {
    const s = state();
    const current = s.agreements.find(a => a.id === id);
    if (!current) throw new Error('Agreement not found.');
    const bay = s.bays.find(b => b.bay_id === current.bay_id);
    const holder = s.holders.find(h => h.id === current.holder_id);
    const next = { ...current, ...terms, id };
    // Terms only: the basis, bay and holder do not change here, so the
    // allocation rules were settled when the agreement was made.
    const problem = validateAgreement({ ...next, basis: current.basis }, bay, holder, s.agreements,
      { allocating: false });
    if (problem) throw new Error(problem);
    const userId = requireUserId();

    const saved = await api.update('parking_agreements', id,
      { ...agreementRow(next), updated_by: userId }, true);
    update(st => ({ ...st, agreements: st.agreements.map(a => a.id === id ? saved : a) }));
    remerge();
    logAudit('update', 'parking_agreement', id, saved.reference,
      { ...AUDIT, beforeData: agreementRow(current), afterData: agreementRow(saved) });
    return saved;
  }

  /**
   * Move an agreement through its lifecycle. Ending or terminating needs the
   * date it ended; ended and terminated are final, and a bay comes back by a
   * NEW agreement so the old one stays true about what happened.
   */
  async function setStatus(id, to, { ends_on = null, ended_reason = null } = {}) {
    const current = state().agreements.find(a => a.id === id);
    if (!current) throw new Error('Agreement not found.');
    if (!canTransition(current.status, to)) {
      throw new Error(`An agreement cannot go from ${current.status} to ${to}.`);
    }
    const ending = to === 'ended' || to === 'terminated';
    const endDate = ending ? (ends_on || current.ends_on || todayISO()) : current.ends_on;
    if (ending && endDate < current.starts_on) throw new Error('The end date is before the start date.');
    const userId = requireUserId();

    const patch = { status: to, updated_by: userId,
      ...(ending ? { ends_on: endDate, ended_reason: ended_reason?.trim() || null } : {}) };
    const saved = await api.update('parking_agreements', id, patch, true);
    update(st => ({ ...st, agreements: st.agreements.map(a => a.id === id ? saved : a) }));

    // An ended agreement's vehicles stop being authorised the same day.
    if (ending) {
      const live = state().vehicles.filter(v => v.agreement_id === id && !v.to_date);
      for (const v of live) await endVehicle(v.id, endDate);
    }
    remerge();
    logAudit('update', 'parking_agreement', id, saved.reference,
      { ...AUDIT, eventAction: `status_${to}`, beforeData: { status: current.status }, afterData: patch });
    return saved;
  }

  /** Delete a mistaken DRAFT. Anything that went live is ended, not deleted. */
  async function deleteDraft(id) {
    const current = state().agreements.find(a => a.id === id);
    if (!current) return;
    if (current.status !== 'draft') throw new Error('Only a draft can be deleted. End or terminate it instead.');
    await api.delete('parking_agreements', id);
    update(st => ({
      ...st,
      agreements: st.agreements.filter(a => a.id !== id),
      vehicles: st.vehicles.filter(v => v.agreement_id !== id),   // cascaded in the database
    }));
    remerge();
    logAudit('delete', 'parking_agreement', id, current.reference, { ...AUDIT });
  }

  // ── Vehicles ─────────────────────────────────────────────────────────────

  async function addVehicle(agreementId, v) {
    const s = state();
    const agreement = s.agreements.find(a => a.id === agreementId);
    if (!agreement) throw new Error('Agreement not found.');
    const problem = validateVehicle(v, agreement, s.vehicles);
    if (problem) throw new Error(problem);
    const userId = requireUserId();

    const saved = await api.create('parking_vehicles', {
      agreement_id: agreementId,
      registration: normaliseReg(v.registration),
      make:   String(v.make ?? '').trim() || null,
      model:  String(v.model ?? '').trim() || null,
      colour: String(v.colour ?? '').trim() || null,
      is_ev:  !!v.is_ev,
      from_date: v.from_date || todayISO(),
      created_by: userId,
    }, true);
    update(st => ({ ...st, vehicles: [...st.vehicles, saved] }));
    logAudit('create', 'parking_vehicle', saved.id, agreement.reference, { ...AUDIT });
    return saved;
  }

  /** A vehicle stops being authorised; its history stays until retention. */
  async function endVehicle(id, onDate = todayISO()) {
    const saved = await api.update('parking_vehicles', id, { to_date: onDate }, true);
    update(st => ({ ...st, vehicles: st.vehicles.map(v => v.id === id ? saved : v) }));
    return saved;
  }

  // ── "Whose car is this?" ────────────────────────────────────────────────

  /**
   * Search by registration. ⚠ Every search is AUDITED: it is the query most
   * open to curiosity, and the log is what makes it answerable afterwards.
   * The search text is logged, the results are not.
   */
  function lookupRegistration(q) {
    const s = state();
    const hits = findByRegistration(q, s);
    logAudit('view', 'parking_vehicle', null, 'registration lookup', {
      ...AUDIT, eventAction: 'registration_lookup', afterData: { query: normaliseReg(q), results: hits.length },
    });
    return hits;
  }

  return {
    subscribe, load, saveBay,
    saveHolder,
    createAgreement, updateAgreement, setStatus, deleteDraft,
    addVehicle, endVehicle,
    lookupRegistration,
  };
}

export const parkingStore = createParkingStore();
