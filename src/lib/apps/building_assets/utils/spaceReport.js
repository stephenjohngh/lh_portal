// src/lib/apps/building_assets/utils/spaceReport.js
// Pure reporting helpers for spaces (P3). Status rollups + CSV serialisers for a
// single space's members and for the building-wide spaces register.
// See docs/requirements/Spaces_Enhancement_Design.md §4.4. Type-1 testable.

import { csvEsc } from './componentsCsv.js';
import { buildSpaceRef } from '$lib/utils/spaceRef.js';
import { buildComponentRef } from '$lib/utils/componentRef.js';
import { statusCfg } from '$lib/utils/resultConstants.js';

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
 * @returns {{reference,name,kind,usage,floor,area_m2,total,ok,problem,failed,inactive}}
 */
export function buildRegisterRow(space, members = [], floors = [], opts = {}) {
  const { byStatus, total } = spaceRollup(members);
  return {
    reference: buildSpaceRef(space, floors),
    name:      space?.name ?? '',
    kind:      space?.kind ?? 'space',
    usage:     space?.space_type ?? '',
    floor:     floors.find(f => f.id === space?.floor_id)?.short_name ?? '',
    area_m2:   opts.area_m2 ?? null,
    total,
    ...byStatus,
  };
}

/**
 * CSV lines (header + one row per space) for the building-wide spaces register.
 * @param {ReturnType<typeof buildRegisterRow>[]} rows
 * @returns {string[]}
 */
export function spacesRegisterCsvRows(rows = []) {
  const header = ['Reference', 'Name', 'Kind', 'Usage', 'Floor', 'Area m2',
    'Components', 'OK', 'Problem', 'Failed', 'Inactive'];
  const lines = rows.map(r => [
    r.reference, r.name, r.kind, r.usage, r.floor,
    r.area_m2 != null ? r.area_m2.toFixed(1) : '',
    r.total, r.ok, r.problem, r.failed, r.inactive,
  ].map(csvEsc).join(','));
  return [header.map(csvEsc).join(','), ...lines];
}
