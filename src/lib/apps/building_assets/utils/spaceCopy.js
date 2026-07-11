// src/lib/apps/building_assets/utils/spaceCopy.js
// Pure helpers for copying spaces between plans — shared by copyPlan (new plan)
// and importSpacesToExistingPlan (existing target plan). Only useful when the two
// floor plans are the same layout (identical images), so polygons line up.
//
// assigned_id: preserved so references stay consistent across identical floors
// (G/S/12 → 1/S/12), but BLANKED when that (kind, assigned_id) already exists on
// the target floor, to avoid the unique (floor_id, kind, assigned_id) index.
// Spaces whose polygon already exists on the target plan are skipped, so a
// re-copy is idempotent (no duplicate outlines).

/**
 * Build the "already taken" guards for a target plan/floor from all spaces.
 * @param {object[]} allSpaces
 * @param {string} targetPlanId
 * @param {string|null} targetFloorId
 * @returns {{ takenRefs: Set<string>, existingSig: Set<string> }}
 */
export function targetSpaceGuards(allSpaces = [], targetPlanId, targetFloorId) {
  const takenRefs   = new Set();   // "kind|assigned_id" present on the target floor
  const existingSig = new Set();   // polygon signatures present on the target plan
  for (const sp of allSpaces) {
    if (sp.floor_id === targetFloorId && sp.assigned_id) {
      takenRefs.add(`${sp.kind ?? 'space'}|${sp.assigned_id}`);
    }
    if (sp.plan_id === targetPlanId) existingSig.add(JSON.stringify(sp.polygon));
  }
  return { takenRefs, existingSig };
}

/**
 * Build insert rows for copying `srcSpaces` onto a target plan/floor.
 * @param {object[]} srcSpaces
 * @param {{ planId:string, floorId:string|null, userId:string|null,
 *           takenRefs?:Set<string>, existingSig?:Set<string> }} opts
 * @returns {object[]} rows for api.createMany('spaces', …)
 */
export function buildSpaceCopyRows(srcSpaces = [], opts) {
  const { planId, floorId, userId, takenRefs = new Set(), existingSig = new Set() } = opts;
  return srcSpaces
    .filter(sp => !existingSig.has(JSON.stringify(sp.polygon)))
    .map(sp => {
      const kind = sp.kind === 'slot' ? 'slot' : 'space';
      const assignedId = (sp.assigned_id && !takenRefs.has(`${kind}|${sp.assigned_id}`))
        ? sp.assigned_id : null;
      return {
        plan_id:     planId,
        floor_id:    floorId,
        name:        sp.name,
        usage:       sp.usage ?? null,
        polygon:     sp.polygon,
        colour:      sp.colour,
        height_m:    sp.height_m   ?? null,
        show_label:  sp.show_label ?? true,
        notes:       sp.notes      ?? null,
        kind,
        assigned_id: assignedId,
        created_by:  userId,
        updated_by:  userId,
      };
    });
}
