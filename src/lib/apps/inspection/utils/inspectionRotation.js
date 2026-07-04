// src/lib/apps/inspection/utils/inspectionRotation.js
// Pure logic for ROTATING inspection definitions (mode='rotating'):
// each period, the next trigger in the pool is exercised (e.g. the next call
// point on the walk route) and its linked components (bells, lift, doors —
// component_links rows) are the checked set.
//
// The next trigger is DERIVED, never stored: the pool member least recently
// tested under this definition, tie-broken by walk order. Self-healing when
// triggers are added / removed / re-ordered. (Which trigger a *started*
// session used IS stored — walk_sessions.trigger_component_id, migration 154 —
// so resuming never re-derives mid-walk.)
//
// See docs/requirements/Configurable_Inspections_Build_Plan.md §6.

import { applyInspectionScope } from '$lib/apps/building_assets/utils/inspectionScope.js';
import { findComponentByRef }   from '$lib/utils/componentRef.js';

/**
 * The definition's trigger pool: components matching its scope, restricted to
 * walkable positions, in rotation order.
 *
 *   - floors without a walk_order are excluded (not on the walk route)
 *   - inspection_sort_order 0 (internal) is excluded
 *   - order: floors.walk_order → inspection_sort_order (nulls last) → asset_id
 *
 * @param {Array}  components  ALL components (flat)
 * @param {object} definition  inspection_definitions row (scope is read)
 * @param {object} ctx         { types, attrDefs, componentAttrs, inspections }
 * @param {Array}  floors
 * @returns {Array} ordered trigger pool
 */
export function deriveTriggerPool(components, definition, ctx, floors) {
  const walkOrderByFloor = new Map(
    (floors ?? []).filter(f => f.walk_order != null).map(f => [f.id, f.walk_order])
  );
  return applyInspectionScope(components ?? [], definition?.scope ?? {}, ctx)
    .filter(c => walkOrderByFloor.has(c.floor_id))
    .filter(c => !(c.inspection_sort_order != null && Number(c.inspection_sort_order) === 0))
    .sort((a, b) => {
      const fo = walkOrderByFloor.get(a.floor_id) - walkOrderByFloor.get(b.floor_id);
      if (fo !== 0) return fo;
      const aO = a.inspection_sort_order ?? null;
      const bO = b.inspection_sort_order ?? null;
      if (aO !== null && bO !== null && aO !== bO) return aO - bO;
      if (aO !== null && bO === null) return -1;
      if (aO === null && bO !== null) return 1;
      return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
    });
}

/**
 * The next trigger: the pool member with the OLDEST last-test under this
 * definition. Never-tested members come first; ties fall to pool order
 * (strict `<` keeps the earlier pool member).
 *
 * @param {Array}  pool        ordered trigger pool (deriveTriggerPool)
 * @param {object} lastTested  { componentId: ISO timestamp } — most recent
 *                             inspected_at per component under this definition
 * @returns {object|null} the next trigger component, or null for an empty pool
 */
export function deriveNextTrigger(pool, lastTested = {}) {
  let best = null;
  let bestT = Infinity;
  for (const c of pool ?? []) {
    const iso = lastTested[c.id];
    const t = iso ? new Date(iso).getTime() : -Infinity;
    if (t < bestT) { best = c; bestT = t; }
  }
  return best;
}

/**
 * The components a trigger exercises, per the definition's link config:
 *
 *   - link_source 'component_links' (default): the trigger's component_links
 *     targets, optionally restricted to link_type_filter, each
 *     to_component_ref resolved via the canonical ref parser. Unresolvable
 *     refs (renamed floor/asset) are returned so the UI can surface them.
 *   - link_source 'self_only': just the trigger — empty linked set.
 *
 * Linked components are NOT walk-excluded: like a targeted repair, a triggered
 * bell inside a riser (sort_order 0) must still be checked.
 *
 * @param {object|null} trigger
 * @param {object} definition      inspection_definitions row
 * @param {object} componentLinks  { [fromComponentId]: component_links[] }
 * @param {{ components: Array, floors: Array, types: Array }} refCtx
 * @returns {{ linked: Array, unresolved: string[] }}
 */
export function resolveLinkedSet(trigger, definition, componentLinks, refCtx) {
  if (!trigger || definition?.link_source === 'self_only') {
    return { linked: [], unresolved: [] };
  }
  let links = componentLinks?.[trigger.id] ?? [];
  if (definition?.link_type_filter) {
    links = links.filter(l => l.link_type === definition.link_type_filter);
  }
  const { components, floors, types } = refCtx;
  const linked = [];
  const unresolved = [];
  const seen = new Set([trigger.id]);
  for (const l of links) {
    const comp = findComponentByRef(l.to_component_ref, components, floors, null, types);
    if (!comp) { unresolved.push(l.to_component_ref); continue; }
    if (seen.has(comp.id)) continue;
    seen.add(comp.id);
    linked.push(comp);
  }
  return { linked, unresolved };
}

/**
 * Everything a rotating session (or its preview) needs, in one call:
 * pool → next trigger → linked set → walk list (trigger pinned first).
 *
 * @param {object} definition
 * @param {{ components: Array, floors: Array, componentLinks: object,
 *           ctx: object, lastTested?: object }} data
 * @returns {{ pool: Array, trigger: object|null, linked: Array,
 *             unresolved: string[], walkComponents: Array }}
 */
export function buildRotatingWalk(definition, { components, floors, componentLinks, ctx, lastTested }) {
  const pool    = deriveTriggerPool(components, definition, ctx, floors);
  const trigger = deriveNextTrigger(pool, lastTested ?? {});
  const { linked, unresolved } = resolveLinkedSet(trigger, definition, componentLinks, {
    components, floors, types: ctx?.types ?? [],
  });
  return {
    pool, trigger, linked, unresolved,
    walkComponents: trigger ? [trigger, ...linked] : [],
  };
}
