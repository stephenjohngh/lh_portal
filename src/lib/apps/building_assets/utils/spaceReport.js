// src/lib/apps/building_assets/utils/spaceReport.js
// Pure reporting helpers for spaces (P3). Status rollups + CSV serialisers for a
// single space's members and for the building-wide spaces register.
// See docs/requirements/Spaces_Enhancement_Design.md §4.4. Type-1 testable.

import { csvEsc } from './componentsCsv.js';
import { buildSpaceRef } from '$lib/utils/spaceRef.js';
import { buildComponentRef } from '$lib/utils/componentRef.js';
import { statusCfg } from '$lib/utils/resultConstants.js';
import { componentsInSpace } from './spaceMembership.js';
import { computeMetresPerUnit, measureArea } from '../components/plan/planMeasure.js';

const STATUS_KEYS = ['ok', 'problem', 'failed', 'inactive'];

/**
 * Count a space's member components by status.
 * @param {object[]} members
 * @returns {{ total:number, byStatus:{ok:number,problem:number,failed:number,inactive:number} }}
 */
export function spaceRollup(members = []) {
  const byStatus = { ok: 0, problem: 0, failed: 0, inactive: 0 };
  for (const c of members) {
    byStatus[STATUS_KEYS.includes(c.status) ? c.status : 'inactive']++;
  }
  return { total: members.length, byStatus };
}

/**
 * CSV lines (header + one row per member) for a single space's components.
 * @returns {string[]}
 */
export function spaceMembersCsvRows(space, members = [], floors = [], types = []) {
  const spaceRef = buildSpaceRef(space, floors);
  const header = ['Space Ref', 'Space Name', 'Component Ref', 'Type', 'Label', 'Status'];
  const rows = members.map(c => {
    const t = types.find(tt => tt.code === c.type_code);
    return [
      spaceRef,
      space?.name ?? '',
      buildComponentRef(c, floors, types),
      t?.name ?? c.type_code ?? '',
      c.label ?? '',
      statusCfg(c.status).label,
    ].map(csvEsc).join(',');
  });
  return [header.map(csvEsc).join(','), ...rows];
}

/**
 * Assemble one building-wide register row from a space + its resolved members.
 * `area_m2` is supplied by the caller (needs per-plan scale), null when unscaled.
 * @returns {{reference,name,kind,type,floor,area_m2,total,ok,problem,failed,inactive}}
 */
export function buildRegisterRow(space, members = [], floors = [], opts = {}) {
  const { byStatus, total } = spaceRollup(members);
  return {
    id:        space?.id ?? null,   // for row actions (delete); not serialised to CSV
    reference: buildSpaceRef(space, floors),
    name:      space?.name ?? '',
    kind:      space?.kind ?? 'space',
    type:      space?.type ?? '',
    floor:     floors.find(f => f.id === space?.floor_id)?.short_name ?? '',
    area_m2:   opts.area_m2 ?? null,
    total,
    ...byStatus,
  };
}

/**
 * Building-wide spaces register — one row per space, resolving membership +
 * floor area per space with that space's own plan aspect ratio/scale. PURE
 * (takes a plain state bag, no store), so it can be called reactively without
 * writing the store. The store's buildSpacesRegister() delegates here.
 * Rows are ordered by floor (standard level_order) then by assigned_id
 * (numeric-aware, blanks last) — the on-screen table and the CSV share it.
 * @param {{spaces?:object[], components?:object[], spaceOverrides?:object[], plans?:object[], floors?:object[]}} state
 * @returns {ReturnType<typeof buildRegisterRow>[]}
 */
export function buildSpacesRegisterRows(state = {}) {
  const { spaces = [], components = [], spaceOverrides = [], plans = [], floors = [] } = state;
  const floorOrder = new Map(floors.map(f => [f.id, f.level_order ?? 9999]));
  const ordered = [...spaces].sort((a, b) => {
    const fo = (floorOrder.get(a.floor_id) ?? 9999) - (floorOrder.get(b.floor_id) ?? 9999);
    if (fo !== 0) return fo;
    const aid = a.assigned_id ?? '';
    const bid = b.assigned_id ?? '';
    if (!aid !== !bid) return aid ? -1 : 1;     // blanks last
    return aid.localeCompare(bid, undefined, { numeric: true });
  });
  return ordered.map(space => {
    const plan = plans.find(p => p.id === space.plan_id);
    const AR   = plan?.image_aspect_ratio
      ?? (plan?.image_width && plan?.image_height ? plan.image_width / plan.image_height : 1);
    const mpu  = computeMetresPerUnit(plan?.scale_ref, AR);
    const members = componentsInSpace(space, components, spaceOverrides, { AR });
    const area_m2 = (space.polygon?.length >= 3 && mpu)
      ? measureArea(space.polygon, AR, mpu) : null;
    return buildRegisterRow(space, members, floors, { area_m2 });
  });
}

/**
 * CSV lines (header + one row per space) for the building-wide spaces register.
 * @param {ReturnType<typeof buildRegisterRow>[]} rows
 * @returns {string[]}
 */
export function spacesRegisterCsvRows(rows = []) {
  const header = ['Reference', 'Name', 'Kind', 'Type', 'Floor', 'Area m2',
    'Components', 'OK', 'Problem', 'Failed', 'Inactive'];
  const lines = rows.map(r => [
    r.reference, r.name, r.kind, r.type, r.floor,
    r.area_m2 != null ? r.area_m2.toFixed(1) : '',
    r.total, r.ok, r.problem, r.failed, r.inactive,
  ].map(csvEsc).join(','));
  return [header.map(csvEsc).join(','), ...lines];
}
