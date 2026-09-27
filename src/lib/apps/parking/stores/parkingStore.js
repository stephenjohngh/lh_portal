// src/lib/apps/parking/stores/parkingStore.js
// Parking: the bay register (P0) and who holds each bay (P1).
// docs/requirements/app_designs/Parking_App_Design.md.
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
import { postJson } from '$lib/utils/request';
import { deleteDocumentsFor } from '$lib/utils/documentApi';
import { auth } from '$lib/stores/auth';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';
import { listParkingBaySpaces } from '$lib/apps/building_assets/public.js';
import { mergeBays, bayFactsRow, validateBayFacts, BAY_DEFAULTS } from '../utils/bayModel.js';
import {
  validateHolder, holderRow, validateAgreement, agreementRow, canTransition,
  normaliseReg, validateVehicle, findByRegistration, todayISO,
  validateNotice, validateDevice, depositRefundProblem, validateMove, endingProblem,
} from '../utils/agreementModel.js';
import { validateApplication, validateOffer, offerBlocks } from '../utils/waitingListModel.js';
import { validateTariff, tariffRow, tariffFor, matchesTariff, reopenedBy } from '../utils/tariffModel.js';

const logger = getLogger('Parking');
const AUDIT = { appId: 'parking', eventCategory: 'parking' };

/**
 * @typedef {Record<string, any>} Row
 * @typedef {{
 *   bays: Row[], floors: Row[], plans: Row[],
 *   holders: Row[], agreements: Row[], vehicles: Row[], devices: Row[], applications: Row[], tariffs: Row[],
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
    bays: [], floors: [], plans: [], holders: [], agreements: [], vehicles: [], devices: [], applications: [], tariffs: [],
    loading: false, error: null,
  }));
  const state = () => get({ subscribe });

  // Kept so a write can re-merge without re-reading every table.
  let spaces = [];
  let rows = [];

  function remerge() {
    update(s => ({ ...s, bays: mergeBays(spaces, rows, s.floors, s.plans, s.agreements, todayISO(), s.applications) }));
  }

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const [bs, pb, floors, plans, holders, agreements, vehicles, devices, applications, tariffs] = await Promise.all([
        listParkingBaySpaces(),
        api.get('parking_bays'),
        api.get('floors', { orderBy: 'level_order', ascending: true }),
        api.get('plans', { select: 'id, name, floor_id, image_url, image_aspect_ratio, scale_ref' }),
        api.getAll('parking_holders', { orderBy: 'display_name' }),
        api.getAll('parking_agreements', { orderBy: 'reference' }),
        api.getAll('parking_vehicles', { orderBy: 'registration' }),
        api.getAll('parking_access_devices', { orderBy: 'issued_on' }),
        api.getAll('parking_applications', { orderBy: 'joined_on' }),
        api.getAll('parking_tariffs', { orderBy: 'effective_from' }),
      ]);
      spaces = bs; rows = pb;
      update(s => ({ ...s, floors, plans, holders, agreements, vehicles, devices, applications, tariffs, loading: false,
        bays: mergeBays(spaces, rows, floors, plans, agreements, todayISO(), applications) }));
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
    const problem = validateAgreement(terms, bay, holder, s.agreements)
      ?? offerBlocks(bay, holderId, s.applications);
    if (problem) throw new Error(problem);
    const userId = requireUserId();

    // Which price the fee was copied from — only if it still matches it.
    const tariff = tariffFor(s.tariffs, bay.size, holder?.holder_type, terms.starts_on);
    const tariffId = matchesTariff(terms, tariff) ? tariff.id : null;

    const bayRow = await ensureBayRow(spaceId);
    const saved = await api.create('parking_agreements', {
      ...agreementRow(terms), tariff_id: tariffId, bay_id: bayRow.id, holder_id: holderId, status: 'draft',
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

    // A fee changed by hand is no longer the list price it was copied from.
    const was = current.tariff_id ? s.tariffs.find(t => t.id === current.tariff_id) : null;
    const tariffId = was && matchesTariff(next, was) ? was.id : null;

    const saved = await api.update('parking_agreements', id,
      { ...agreementRow(next), tariff_id: tariffId, updated_by: userId }, true);
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
    // Notice is its own act, with a date, who served it and an end date.
    if (to === 'notice_given') throw new Error('Serve notice with its date and who served it.');
    if (current.status === 'notice_given' && to === 'active') return withdrawNotice(id);
    const ending = to === 'ended' || to === 'terminated';
    const endDate = ending ? (ends_on || current.ends_on || todayISO()) : current.ends_on;
    if (ending) {
      const problem = endingProblem(current, endDate, state().vehicles);
      if (problem) throw new Error(problem);
    }
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

  // ── Notice (P2) ─────────────────────────────────────────────────────────

  /**
   * Serve notice: the date, who served it, and the date it ends. The end date
   * the agreement had before is kept, so withdrawing notice restores it.
   */
  async function serveNotice(id, { served_on, served_by, ends_on }) {
    const current = state().agreements.find(a => a.id === id);
    const problem = validateNotice(current, { served_on, served_by, ends_on });
    if (problem) throw new Error(problem);
    const userId = requireUserId();
    const saved = await api.update('parking_agreements', id, {
      status: 'notice_given', notice_served_on: served_on, notice_served_by: served_by,
      ends_on_before_notice: current.ends_on ?? null, ends_on, updated_by: userId,
    }, true);
    update(st => ({ ...st, agreements: st.agreements.map(a => a.id === id ? saved : a) }));
    remerge();
    logAudit('update', 'parking_agreement', id, saved.reference,
      { ...AUDIT, eventAction: 'notice_served', afterData: { served_on, served_by, ends_on } });
    return saved;
  }

  /** Withdraw notice: back to active, with the end date it had before. */
  async function withdrawNotice(id) {
    const current = state().agreements.find(a => a.id === id);
    if (current?.status !== 'notice_given') throw new Error('No notice has been served on this agreement.');
    const userId = requireUserId();
    const saved = await api.update('parking_agreements', id, {
      status: 'active', ends_on: current.ends_on_before_notice ?? null,
      notice_served_on: null, notice_served_by: null, ends_on_before_notice: null, updated_by: userId,
    }, true);
    update(st => ({ ...st, agreements: st.agreements.map(a => a.id === id ? saved : a) }));
    remerge();
    logAudit('update', 'parking_agreement', id, saved.reference, { ...AUDIT, eventAction: 'notice_withdrawn' });
    return saved;
  }

  // ── Access devices (P2) ─────────────────────────────────────────────────

  async function issueDevice(agreementId, dev) {
    const s = state();
    const agreement = s.agreements.find(a => a.id === agreementId);
    if (!agreement) throw new Error('Agreement not found.');
    const problem = validateDevice(dev, s.devices, s.agreements);
    if (problem) throw new Error(problem);
    const userId = requireUserId();
    const saved = await api.create('parking_access_devices', {
      agreement_id: agreementId, device_type: dev.device_type, serial: String(dev.serial).trim(),
      issued_on: dev.issued_on || todayISO(), notes: String(dev.notes ?? '').trim() || null,
      created_by: userId,
    }, true);
    update(st => ({ ...st, devices: [...st.devices, saved] }));
    logAudit('create', 'parking_device', saved.id, agreement.reference, { ...AUDIT });
    return saved;
  }

  async function returnDevice(id, onDate = todayISO()) {
    const dev = state().devices.find(d => d.id === id);
    if (!dev) throw new Error('Device not found.');
    if (onDate < dev.issued_on) throw new Error('It cannot come back before it was issued.');
    const saved = await api.update('parking_access_devices', id, { returned_on: onDate }, true);
    update(st => ({ ...st, devices: st.devices.map(d => d.id === id ? saved : d) }));
    const ref = state().agreements.find(a => a.id === dev.agreement_id)?.reference ?? '';
    logAudit('update', 'parking_device', id, ref,
      { ...AUDIT, eventAction: 'device_returned', afterData: { returned_on: onDate } });
    return saved;
  }

  /** Mark the deposit refunded. ⛔ Not while a device it secures is out. */
  async function refundDeposit(id, onDate = todayISO()) {
    const s = state();
    const current = s.agreements.find(a => a.id === id);
    const problem = depositRefundProblem(current, s.devices, s.agreements);
    if (problem) throw new Error(problem);
    const userId = requireUserId();
    const saved = await api.update('parking_agreements', id,
      { deposit_refunded_on: onDate, updated_by: userId }, true);
    update(st => ({ ...st, agreements: st.agreements.map(a => a.id === id ? saved : a) }));
    logAudit('update', 'parking_agreement', id, saved.reference,
      { ...AUDIT, eventAction: 'deposit_refunded', afterData: { deposit_refunded_on: onDate } });
    return saved;
  }

  // ── Moving to another bay (P2) ──────────────────────────────────────────

  /**
   * Move an active licence to another bay from a date. Done by one database
   * function (parking_move_to_bay) so it cannot half happen: the old
   * agreement ends the day before, a new one starts on the new bay with the
   * same holder and terms, and vehicles and devices are carried across.
   */
  async function moveToBay(id, newSpaceId, onDate) {
    const s = state();
    const current = s.agreements.find(a => a.id === id);
    const newBay = s.bays.find(b => b.space_id === newSpaceId);
    const holder = s.holders.find(h => h.id === current?.holder_id);
    const problem = validateMove(current, newBay, onDate, holder, s.agreements, s.applications);
    if (problem) throw new Error(problem);

    const bayRow = await ensureBayRow(newSpaceId);
    const newId = await api.rpc('parking_move_to_bay',
      { p_agreement: id, p_new_bay: bayRow.id, p_on: onDate });
    // Several tables changed at once; read them back rather than guess.
    await load();
    logAudit('update', 'parking_agreement', id, current.reference,
      { ...AUDIT, eventAction: 'moved_bay', afterData: { to_bay: newBay.ref, on: onDate, new_agreement: newId } });
    return newId;
  }

  // ── The timeline (P2) ───────────────────────────────────────────────────

  /**
   * An agreement's timeline, plus the bay's own entries (out of use, back in
   * use). Written by the database; read-only here.
   */
  async function loadEvents(agreementId) {
    const agreement = state().agreements.find(a => a.id === agreementId);
    const [own, bay] = await Promise.all([
      api.get('parking_events', { filters: { agreement_id: agreementId }, orderBy: 'created_at', ascending: true }),
      agreement
        ? api.get('parking_events', { filters: { bay_id: agreement.bay_id }, orderBy: 'created_at', ascending: true })
        : Promise.resolve([]),
    ]);
    const bayOnly = (bay ?? []).filter(e => !e.agreement_id);
    return [...(own ?? []), ...bayOnly].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // ── The waiting list (P3) ───────────────────────────────────────────────

  function patchApplication(saved) {
    update(st => ({ ...st, applications: st.applications.map(a => a.id === saved.id ? saved : a) }));
    remerge();
  }

  /** Put a holder on the waiting list for a bay size, or any size. */
  async function addApplication(holderId, { wanted_size, joined_on, notes }) {
    const s = state();
    const app = { holder_id: holderId, wanted_size, joined_on };
    const problem = validateApplication(app, s.applications);
    if (problem) throw new Error(problem);
    const userId = requireUserId();
    const saved = await api.create('parking_applications', {
      ...app, notes: String(notes ?? '').trim() || null, created_by: userId, updated_by: userId,
    }, true);
    update(st => ({ ...st, applications: [...st.applications, saved] }));
    logAudit('create', 'parking_application', saved.id, 'waiting list',
      { ...AUDIT, afterData: { wanted_size, joined_on } });
    return saved;
  }

  /**
   * Offer a bay to a waiting application. The bay is held for them until the
   * offer is accepted, declined or lapses; one open offer per bay.
   */
  async function makeOffer(appId, spaceId, { made_on, expires_on }) {
    const s = state();
    const app = s.applications.find(a => a.id === appId);
    const bay = s.bays.find(b => b.space_id === spaceId);
    const problem = validateOffer(app, bay, s.agreements, s.applications, { made_on, expires_on });
    if (problem) throw new Error(problem);
    const userId = requireUserId();
    const bayRow = await ensureBayRow(spaceId);
    const saved = await api.update('parking_applications', appId, {
      status: 'offered', offered_bay_id: bayRow.id, offer_made_on: made_on, offer_expires_on: expires_on,
      last_offer_outcome: null, updated_by: userId,
    }, true);
    patchApplication(saved);
    logAudit('update', 'parking_application', appId, 'waiting list',
      { ...AUDIT, eventAction: 'offer_made', afterData: { bay: bay.ref, expires_on } });
    return saved;
  }

  /**
   * The offer did not become an agreement: declined, or lapsed. First come,
   * first served: the application goes back to the queue KEEPING ITS PLACE.
   */
  async function returnToQueue(appId, outcome) {
    if (outcome !== 'declined' && outcome !== 'lapsed') throw new Error('Say whether the offer was declined or lapsed.');
    const app = state().applications.find(a => a.id === appId);
    if (app?.status !== 'offered') throw new Error('There is no open offer on that application.');
    const userId = requireUserId();
    const saved = await api.update('parking_applications', appId,
      { status: 'waiting', last_offer_outcome: outcome, updated_by: userId }, true);
    patchApplication(saved);
    logAudit('update', 'parking_application', appId, 'waiting list', { ...AUDIT, eventAction: `offer_${outcome}` });
    return saved;
  }

  /** The offer was accepted and the agreement made. */
  async function markAllocated(appId, agreementId) {
    const userId = requireUserId();
    const saved = await api.update('parking_applications', appId,
      { status: 'allocated', agreement_id: agreementId, updated_by: userId }, true);
    patchApplication(saved);
    logAudit('update', 'parking_application', appId, 'waiting list', { ...AUDIT, eventAction: 'offer_accepted' });
    return saved;
  }

  async function withdrawApplication(appId) {
    const app = state().applications.find(a => a.id === appId);
    if (!app || (app.status !== 'waiting' && app.status !== 'offered')) {
      throw new Error('Only an open application can be withdrawn.');
    }
    const userId = requireUserId();
    const saved = await api.update('parking_applications', appId, { status: 'withdrawn', updated_by: userId }, true);
    patchApplication(saved);
    logAudit('update', 'parking_application', appId, 'waiting list', { ...AUDIT, eventAction: 'withdrawn' });
    return saved;
  }

  /** An application's timeline, written by the database. */
  async function loadApplicationEvents(appId) {
    return api.get('parking_events', { filters: { application_id: appId }, orderBy: 'created_at', ascending: true });
  }

  /**
   * Delete a mistaken DRAFT. Anything that went live is ended, not deleted.
   * A draft made from an accepted waiting-list offer REOPENS that offer
   * (migration 229): the person keeps the bay they were offered, until they
   * accept again, decline or it lapses.
   */
  async function deleteDraft(id) {
    const current = state().agreements.find(a => a.id === id);
    if (!current) return;
    if (current.status !== 'draft') throw new Error('Only a draft can be deleted. End or terminate it instead.');
    const reopens = state().applications.some(a => a.agreement_id === id && a.status === 'allocated');
    // ⛔ Its documents first (2026-09-27): a draft may already carry a licence
    // file, which names a person who is not staff. The library has no FK to the
    // agreement, so deleting the row left the file in Drive, outside anything
    // the portal — or its retention — could reach. If one cannot be deleted the
    // draft is kept, so trying again finishes.
    await deleteDocumentsFor('parking_agreement', id);
    await api.delete('parking_agreements', id);
    // The database changed the application too; read it back rather than guess.
    const applications = reopens
      ? await api.getAll('parking_applications', { orderBy: 'joined_on' })
      : state().applications;
    update(st => ({
      ...st,
      agreements: st.agreements.filter(a => a.id !== id),
      vehicles: st.vehicles.filter(v => v.agreement_id !== id),   // cascaded in the database
      devices: st.devices.filter(d => d.agreement_id !== id),
      applications,
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

  // ── The price list ───────────────────────────────────────────────────────

  /**
   * Add a price for a bay size from a date. It closes the price it replaces
   * the day before (migration 225 does that, in the same statement); a price
   * is never edited.
   */
  async function addTariff(t) {
    const problem = validateTariff(t, state().tariffs);
    if (problem) throw new Error(problem);
    const userId = requireUserId();
    await api.create('parking_tariffs', { ...tariffRow(t), created_by: userId }, true);
    // Re-read: the insert also closed the row it replaces.
    const tariffs = await api.getAll('parking_tariffs', { orderBy: 'effective_from' });
    update(st => ({ ...st, tariffs }));
    const row = tariffRow(t);
    logAudit('create', 'parking_tariff', null, `${row.bay_size} from ${row.effective_from}`,
      { ...AUDIT, afterData: row });
  }

  /**
   * Remove a price added in error, reopening the one it had closed. Refused
   * once any agreement was made at it —
   * that agreement would lose the price it came from — and the database
   * refuses it too.
   */
  async function deleteTariff(id) {
    const s = state();
    const t = s.tariffs.find(x => x.id === id);
    if (!t) throw new Error('Price not found.');
    const used = s.agreements.filter(a => a.tariff_id === id).length;
    if (used) throw new Error(`${used} agreement${used === 1 ? ' was' : 's were'} made at this price, so it cannot be removed.`);
    const previous = reopenedBy(s.tariffs, t);
    await api.delete('parking_tariffs', id);
    // The price it had closed becomes current again, so there is no gap.
    if (previous && !t.effective_to) await api.update('parking_tariffs', previous.id, { effective_to: null });
    const tariffs = await api.getAll('parking_tariffs', { orderBy: 'effective_from' });
    update(st => ({ ...st, tariffs }));
    logAudit('delete', 'parking_tariff', id, `${t.bay_size} from ${t.effective_from}`,
      { ...AUDIT, beforeData: tariffRow(t) });
  }

  // ── Retention (migration 226, decision D8) ───────────────────────────────
  // The rule and its periods live in the database function; it runs every
  // night on its own. These let an admin see what is due and run it now.

  /** What would be removed today, and the periods. Changes nothing. */
  async function retentionDue() {
    return api.rpc('parking_apply_retention', { p_dry_run: true });
  }

  /** The last few runs, newest first. Counts only; never what was removed. */
  async function retentionRuns(limit = 5) {
    return api.get('parking_retention_runs', { orderBy: 'ran_at', ascending: false, limit });
  }

  /**
   * Delete outdated records, then re-read everything it may have touched.
   * Through the server, because a signed licence's file is in storage and must
   * be deleted before its agreement can go (migration 227).
   */
  async function runRetention() {
    requireUserId();
    const counts = await postJson('/api/parking/retention', {});
    await load();
    // Counts only: the audit log must not name what was removed.
    const { periods, ...removed } = counts ?? {};
    logAudit('delete', 'parking_retention', null, 'Retention run', { ...AUDIT, afterData: removed });
    return counts;
  }

  return {
    subscribe, load, saveBay,
    addTariff, deleteTariff,
    retentionDue, retentionRuns, runRetention,
    saveHolder,
    createAgreement, updateAgreement, setStatus, deleteDraft,
    serveNotice, withdrawNotice,
    issueDevice, returnDevice, refundDeposit,
    moveToBay, loadEvents,
    addApplication, makeOffer, returnToQueue, markAllocated, withdrawApplication, loadApplicationEvents,
    addVehicle, endVehicle,
    lookupRegistration,
  };
}

export const parkingStore = createParkingStore();
