// src/lib/apps/parking/utils/bayModel.js
// Parking, phase 0 — the bay register, as pure functions.
// docs/requirements/app_designs/Parking_App_Design.md §5.1, §6.
//
// A BAY is two things joined: the drawing, owned by Building Assets (a Space of
// kind 'slot' with its size as its Type and its reference L/PK/22), and the
// parking facts, owned here (parking_bays). A drawn bay with no parking row is
// still a bay: it takes the defaults — licensable, in service — so drawing a
// bay is enough for it to appear, and nothing has to be "registered" twice.
//
// Nothing here reads the database. The store loads, this decides.

import { buildSpaceRef } from '$lib/utils/spaceRef.js';
import { computeMetresPerUnit, measureArea, measureSides }
  from '$lib/apps/building_assets/components/plan/planMeasure.js';
import { PARKING_BAY_TYPES } from '$lib/apps/building_assets/utils/spaceTypeOptions.js';
import { currentAgreement, reservingAgreement, todayISO } from './agreementModel.js';
import { matchesSearch } from '$lib/utils/textSearch.js';

/** How a bay is held. Only `licensable` may ever be allocated (P1). */
export const TENURES = [
  { value: 'licensable',         label: 'Licensable',          hint: 'Ours to allocate under a licence' },
  { value: 'demised',            label: 'Demised to a flat',   hint: "Part of a flat's lease — recorded, never allocated" },
  { value: 'lease_right',        label: 'Lease right to park', hint: "A right in a flat's lease — recorded, never allocated" },
  { value: 'not_for_allocation', label: 'Not for allocation',  hint: 'Kept free: loading, contractors, a turning space' },
];
export const TENURE_LABEL = Object.fromEntries(TENURES.map(t => [t.value, t.label]));

/** Tenures whose bay belongs to a flat's lease, and so must name the unit. */
export const UNIT_TENURES = new Set(['demised', 'lease_right']);

/**
 * The state a bay is shown in, on the map and in the list. Ordered: the first
 * that applies wins.
 */
export const BAY_STATES = [
  { value: 'out_of_use',         label: 'Out of use',         colour: '#ef4444' },
  { value: 'allocated',          label: 'Allocated',          colour: '#3b82f6' },
  { value: 'offered',            label: 'Offered',            colour: '#f59e0b' },
  // Held by a draft, or by a licence that starts later: not free to allocate,
  // and not somewhere to park either. Shown so it is never read as Free.
  { value: 'reserved',           label: 'Reserved',           colour: '#06b6d4' },
  { value: 'demised',            label: 'Belongs to a flat',  colour: '#8b5cf6' },
  { value: 'not_for_allocation', label: 'Not for allocation', colour: '#64748b' },
  { value: 'free',               label: 'Free',               colour: '#22c55e' },
];
export const BAY_STATE = Object.fromEntries(BAY_STATES.map(s => [s.value, s]));

/** Defaults for a drawn bay that has no parking row yet. */
export const BAY_DEFAULTS = Object.freeze({
  tenure: 'licensable',
  unit_ref: null,
  is_accessible: false,
  is_tandem: false,
  planning_restricted: false,
  in_service: true,
  out_of_use_reason: null,
  out_of_use_until: null,
  max_height_m: null,
  notes: null,
});

/**
 * The bay's state. Out of use wins over everything, because a bay nobody can
 * park in is the one fact that matters whoever holds it.
 * @param {object} bay a merged bay
 */
export function bayState(bay) {
  if (bay.in_service === false) return 'out_of_use';
  // Allocated means licensed to somebody today. A demised bay whose holder is
  // recorded is still a bay that belongs to a flat, not one we allocated.
  if (bay.current && (bay.current.basis === 'licence' || bay.current.basis === 'adjustment')) return 'allocated';
  // Offered to someone on the waiting list: held for them until the offer ends.
  if (bay.offer) return 'offered';
  if (bay.reserved) return 'reserved';
  if (UNIT_TENURES.has(bay.tenure)) return 'demised';
  if (bay.tenure === 'not_for_allocation') return 'not_for_allocation';
  return 'free';
}

/**
 * The bay's size, which is its Type. Anything else — a bay drawn before
 * migration 220, or typed by hand — reads as "not set", never as a size.
 */
export function baySize(space) {
  return PARKING_BAY_TYPES.includes(space?.type) ? space.type : null;
}

/**
 * Measure a bay from its drawing: area and its two principal side lengths.
 * Null when the plan has no scale, rather than a guess.
 * @param {object} space  {polygon}
 * @param {object} plan   {scale_ref, image_aspect_ratio}
 */
export function measureBay(space, plan) {
  const poly = space?.polygon ?? [];
  const ar   = plan?.image_aspect_ratio ?? null;
  const mpu  = computeMetresPerUnit(plan?.scale_ref ?? null, ar);
  if (poly.length < 3 || !mpu) return null;
  const sides = measureSides(poly, ar, mpu);     // ascending
  return {
    area: measureArea(poly, ar, mpu),
    // For a rectangle the two shortest sides are the width and the two
    // longest the length; for any other shape these are still the honest
    // shortest and longest edges.
    width:  sides[0] ?? null,
    length: sides[sides.length - 1] ?? null,
  };
}

/**
 * @typedef {import('$lib/database.types').Tables<'parking_bays'>} BayRow
 * @typedef {import('$lib/database.types').Tables<'parking_agreements'> & Record<string, any>} AgreementRow
 * @typedef {import('$lib/database.types').Tables<'parking_applications'> & Record<string, any>} ApplicationRow
 *
 * A bay as every Parking screen sees it: the parking_bays facts (BAY_DEFAULTS
 * where none have been saved yet, so every field may be absent) joined to its
 * drawing and to what holds it today. Built ONLY by mergeBays below.
 * ⚠ Intersected with Record<string, any> on purpose: the facts are spread in,
 * so a bare Partial<BayRow> would refuse fields that genuinely arrive.
 * @typedef {Partial<BayRow> & Record<string, any> & {
 *   bay_id:   string|null,
 *   space_id: string,
 *   space:    Record<string, any>,
 *   ref:      string,
 *   number:   string|null,
 *   size:     string|null,
 *   floor_id: string|null,
 *   plan_id:  string|null,
 *   measured: { area: number|null, width: number|null, length: number|null } | null,
 *   current:  AgreementRow|null,
 *   reserved: AgreementRow|null,
 *   offer:    ApplicationRow|null,
 *   state:    string,
 * }} MergedBay
 */

/**
 * Join the drawings to their parking facts.
 * @param {object[]} spaces  kind 'slot' spaces (building_assets public.js)
 * @param {object[]} rows    parking_bays rows
 * @param {object[]} floors
 * @param {object[]} plans
 * @param {object[]} [agreements]  to find the agreement holding each bay today
 * @param {string}   [today]       YYYY-MM-DD
 * @param {object[]} [applications] to find an open waiting-list offer on each bay
 * @returns {MergedBay[]} merged bays, in floor then bay-number order
 */
export function mergeBays(spaces, rows, floors = [], plans = [], agreements = [], today = todayISO(), applications = []) {
  const bySpace = new Map((rows ?? []).map(r => [r.space_id, r]));
  const floorOrder = new Map((floors ?? []).map((f, i) => [f.id, f.level_order ?? i]));
  const planById = new Map((plans ?? []).map(p => [p.id, p]));

  return (spaces ?? []).map(space => {
    const row = bySpace.get(space.id) ?? null;
    const facts = { ...BAY_DEFAULTS, ...(row ?? {}) };
    const bay = {
      ...facts,
      bay_id:    row?.id ?? null,         // null until the facts are first saved
      space_id:  space.id,
      space,
      ref:       buildSpaceRef(space, floors),
      number:    space.assigned_id ?? null,
      size:      baySize(space),
      floor_id:  space.floor_id,
      plan_id:   space.plan_id,
      measured:  measureBay(space, planById.get(space.plan_id)),
      current:   row ? currentAgreement(row.id, agreements, today) : null,
      reserved:  row ? reservingAgreement(row.id, agreements, today) : null,
      offer:     row ? (applications ?? []).find(a => a.status === 'offered' && a.offered_bay_id === row.id) ?? null : null,
    };
    bay.state = bayState(bay);
    return bay;
  }).sort((a, b) =>
    (floorOrder.get(a.floor_id) ?? 99) - (floorOrder.get(b.floor_id) ?? 99)
    || compareNumbers(a.number, b.number));
}

// Bay numbers are text but usually numeric: 9 before 22 before 100, and a bay
// with no number last, where it is most visible as something to fix.
function compareNumbers(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

/**
 * What a set of bays holds, for the summary line: counts by state and by size.
 * `unsized` and `unnumbered` are the two setup gaps worth showing.
 */
export function baySummary(bays) {
  const byState = Object.fromEntries(BAY_STATES.map(s => [s.value, 0]));
  const bySize = Object.fromEntries(PARKING_BAY_TYPES.map(s => [s, 0]));
  let unsized = 0, unnumbered = 0;
  for (const b of bays ?? []) {
    byState[b.state] = (byState[b.state] ?? 0) + 1;
    if (b.size) bySize[b.size] += 1; else unsized += 1;
    if (!b.number) unnumbered += 1;
  }
  return { total: (bays ?? []).length, byState, bySize, unsized, unnumbered };
}

/**
 * Filter bays by level, size and state. An empty or missing filter matches all.
 * @param {object[]} bays
 * @param {{floorId?:string, size?:string, state?:string, q?:string}} f
 */
export function filterBays(bays, f = {}) {
  return (bays ?? []).filter(b =>
    (!f.floorId || b.floor_id === f.floorId)
    && (!f.size  || (f.size === '__none' ? !b.size : b.size === f.size))
    && (!f.state || b.state === f.state)
    && matchesSearch([b.ref, b.space?.name, b.space?.label, b.unit_ref, b.notes], f.q));
}

/**
 * Check an edit before it is saved. Mirrors the two database CHECKs in
 * migration 221, so the person sees the reason instead of a constraint name.
 * @returns {string|null} the problem, or null
 */
export function validateBayFacts(f) {
  if (UNIT_TENURES.has(f.tenure) && !String(f.unit_ref ?? '').trim()) {
    return 'Say which flat’s lease this bay belongs to.';
  }
  if (f.in_service === false && !String(f.out_of_use_reason ?? '').trim()) {
    return 'Say why the bay is out of use.';
  }
  if (f.max_height_m != null && f.max_height_m !== '' && !(Number(f.max_height_m) > 0)) {
    return 'Headroom must be a positive number of metres.';
  }
  return null;
}

/**
 * The row to write for an edit: only parking facts, normalised, and nothing
 * that belongs to the drawing. A tenure that no longer names a lease drops its
 * unit; a bay back in service drops its reason and date.
 */
export function bayFactsRow(f) {
  const unitTenure = UNIT_TENURES.has(f.tenure);
  const inService = f.in_service !== false;
  const height = f.max_height_m == null || f.max_height_m === '' ? null : Number(f.max_height_m);
  return {
    tenure:              f.tenure ?? 'licensable',
    unit_ref:            unitTenure ? String(f.unit_ref ?? '').trim() || null : null,
    is_accessible:       !!f.is_accessible,
    is_tandem:           !!f.is_tandem,
    planning_restricted: !!f.planning_restricted,
    in_service:          inService,
    out_of_use_reason:   inService ? null : String(f.out_of_use_reason ?? '').trim() || null,
    out_of_use_until:    inService ? null : f.out_of_use_until || null,
    max_height_m:        height,
    notes:               String(f.notes ?? '').trim() || null,
  };
}
