// src/lib/apps/maintenance/utils/groupMembership.js
//
// Resolves a maintenance_group's LIVE membership — the real components it covers —
// and rolls up their current condition, for the 10-Year Plan (R1 of the review).
//
// A group collects assets to plan for renewal together via three independent
// criteria; a component is a member if it matches ANY of them (union):
//   * system_ids — its building system (via its component_type's building_system_id)
//   * type_codes — its component_type
//   * space_ids  — a space it sits in (geometric, reusing spaceMembership)
//
// This is CONTEXT ONLY (R0/R5): the roll-up tells the planner what a group covers
// and how those assets are doing right now; it never moves a renewal date. A group
// with no criteria is a purely manual capital line (`manual: true`) — it forecasts
// from its own figures and simply has no live assets to show.
//
// Condition comes straight off components.status (the canonical current status the
// markers show — ok/problem/failed/inactive), so no inspection history is needed.
//
// Pure + Type-1 tested (groupMembership.test.js).

import { componentSpaceIdMap } from '$lib/apps/building_assets/utils/spaceMembership.js';

/**
 * Build a resolver bound to the current building-assets reference data. Shared
 * maps (type→system, component→spaces) are computed once, then reused per group.
 *
 * @param {{ components?:object[], types?:object[], spaces?:object[], spaceOverrides?:object[], plans?:object[] }} ctx
 * @returns {(group:object) => { componentIds:string[], total:number,
 *            byStatus:{ok:number,problem:number,failed:number,inactive:number},
 *            attention:number, manual:boolean }}
 */
export function makeGroupMembershipResolver({ components = [], types = [], spaces = [], spaceOverrides = [], plans = [] } = {}) {
  const typeToSystem = new Map(types.map(t => [t.code, t.building_system_id]));
  // The space map is geometric (point-in-polygon per plan) — only build it when
  // there are spaces to test against.
  const spaceMap = spaces.length ? componentSpaceIdMap(components, spaces, spaceOverrides, plans) : new Map();

  return function resolve(group) {
    const systemSet = new Set(group?.system_ids ?? []);
    const typeSet   = new Set(group?.type_codes ?? []);
    const spaceSet  = new Set(group?.space_ids  ?? []);
    const byStatus  = { ok: 0, problem: 0, failed: 0, inactive: 0 };
    const componentIds = [];

    if (!systemSet.size && !typeSet.size && !spaceSet.size) {
      return { componentIds, total: 0, byStatus, attention: 0, manual: true };
    }

    for (const c of components) {
      const inSystem = systemSet.size > 0 && systemSet.has(typeToSystem.get(c.type_code));
      const inType   = typeSet.size   > 0 && typeSet.has(c.type_code);
      let inSpace = false;
      if (spaceSet.size > 0) {
        const cs = spaceMap.get(c.id);
        if (cs) { for (const sid of cs) { if (spaceSet.has(sid)) { inSpace = true; break; } } }
      }
      if (inSystem || inType || inSpace) {
        componentIds.push(c.id);
        if (byStatus[c.status] != null) byStatus[c.status]++;
      }
    }

    return {
      componentIds,
      total: componentIds.length,
      byStatus,
      attention: byStatus.problem + byStatus.failed,   // what a planner might act on
      manual: false,
    };
  };
}

/** One-shot convenience (builds a resolver and applies it to a single group). */
export function resolveGroupMembership(group, ctx) {
  return makeGroupMembershipResolver(ctx)(group);
}
