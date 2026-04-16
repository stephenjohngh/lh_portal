// src/lib/apps/building_assets/stores/planActions.js
// Plan domain: plans[], scale calibration, image upload, plan CRUD, copy.
// Receives the writable `update` function and the supabase client from buildingAssetsStore.

import { api }        from '$lib/utils/api';
import { getLogger }  from '$lib/utils/logger';
import { requireUserId } from './helpers.js';

const logger = getLogger('BuildingAssets');

// Factory — call once at store creation time.
// supabase: the supabase client (needed for Storage operations).
export function createPlanActions(update, supabase) {

  // ── Image upload ──────────────────────────────────────────────────────
  // Uploads to the plan-images bucket and returns the public URL.
  async function uploadPlanImage(file) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `plans/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('plan-images').upload(path, file);
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    const { data: { publicUrl } } = supabase.storage.from('plan-images').getPublicUrl(path);
    return publicUrl;
  }

  // ── Scale calibration ─────────────────────────────────────────────────
  // Saves a scale reference line and the image aspect ratio on a plan.
  // scaleRef:    { x1, y1, x2, y2, metres }  (or null to clear)
  // aspectRatio: number — native image W / H  (or null to clear)
  async function updatePlanScale(planId, scaleRef, aspectRatio) {
    const updated = await api.update('plans', planId, {
      scale_ref:          scaleRef,
      image_aspect_ratio: aspectRatio
    });
    update(s => ({
      ...s,
      plans: s.plans.map(p => p.id === planId ? { ...p, ...updated } : p)
    }));
    logger('Updated plan scale:', planId,
      scaleRef ? `ref=${scaleRef.metres}m AR=${aspectRatio}` : 'cleared');
    return updated;
  }

  // ── Create a new plan (uploads image first) ───────────────────────────
  // data: { name, building, floor_id, description }
  async function createPlan(data, file) {
    requireUserId();
    const imageUrl = await uploadPlanImage(file);
    const plan = await api.create('plans', {
      name:        data.name?.trim()        || null,
      building:    data.building?.trim()    || '',
      floor_id:    data.floor_id            || null,
      description: data.description?.trim() || null,
      image_url:   imageUrl,
    });
    update(s => ({
      ...s,
      plans: [...s.plans, plan].sort((a, b) =>
        (a.building ?? '').localeCompare(b.building ?? ''))
    }));
    logger('Created plan:', plan.id, data.building);
    return plan;
  }

  // ── Update plan metadata (no image change) ────────────────────────────
  async function updatePlanInfo(planId, data) {
    requireUserId();
    const updated = await api.update('plans', planId, {
      name:        data.name?.trim()        || null,
      building:    data.building?.trim()    || '',
      floor_id:    data.floor_id            || null,
      description: data.description?.trim() || null,
    });
    update(s => ({
      ...s,
      plans: s.plans.map(p => p.id === planId ? { ...p, ...updated } : p)
    }));
    logger('Updated plan info:', planId);
    return updated;
  }

  // ── Replace the image on an existing plan ────────────────────────────
  // Also clears scale_ref and image_aspect_ratio — both must be re-calibrated.
  async function replacePlanImage(planId, file) {
    requireUserId();
    const imageUrl = await uploadPlanImage(file);
    const updated  = await api.update('plans', planId, {
      image_url:          imageUrl,
      image_aspect_ratio: null,
      scale_ref:          null,
    });
    update(s => ({
      ...s,
      plans: s.plans.map(p => p.id === planId ? { ...p, ...updated } : p)
    }));
    logger('Replaced plan image:', planId);
    return updated;
  }

  // ── Copy a plan ───────────────────────────────────────────────────────
  // Creates a new plan row reusing the same image URL, then copies all
  // components (with their attribute values) and their component_links.
  //
  // scale_ref is NOT copied — it references pixel distances on the original.
  // onProgress(done, total) is called after each component is copied.
  //
  // Component floor_id: all copied components get newPlan.floor_id (not the
  // source floor), so they are correctly associated with the new floor.
  //
  // Link remapping: for each copied component's links, to_component_ref strings
  // that point to another source-plan component are rewritten with the new
  // floor's short_name so they resolve against the new copies. Links that
  // point to components outside the source plan are preserved unchanged.
  //
  // Returns { plan, copied } — new plan row and count of components copied.
  async function copyPlan(sourcePlanId, data, onProgress = null) {
    const userId = requireUserId();

    let sourcePlan  = null;
    let floors      = [];
    let facilities  = [];
    let types       = [];
    update(s => {
      sourcePlan = s.plans.find(p => p.id === sourcePlanId);
      floors     = s.floors;
      facilities = s.facilities;
      types      = s.types;
      return s;
    });
    if (!sourcePlan) throw new Error('Source plan not found');

    const newFloorId = data.floor_id ?? sourcePlan.floor_id ?? null;

    const newPlan = await api.create('plans', {
      name:               (data.name     ?? sourcePlan.name)?.trim()     || null,
      building:           (data.building ?? sourcePlan.building)?.trim() || '',
      floor_id:           newFloorId,
      description:        sourcePlan.description                         || null,
      image_url:          sourcePlan.image_url,
      image_aspect_ratio: sourcePlan.image_aspect_ratio                  || null,
      // scale_ref intentionally omitted (reset to null)
    });

    const srcComponents = await api.get('components', { filters: { plan_id: sourcePlanId } });
    const total = srcComponents.length;
    let copied = 0;

    // oldId → newComp — built during the component loop, used for link remapping
    const idMap = {};

    if (total > 0) {
      const allAttrs = await api.get('component_attributes');

      for (const c of srcComponents) {
        if (onProgress) onProgress(copied, total);

        const newComp = await api.create('components', {
          plan_id:           newPlan.id,
          floor_id:          newFloorId,   // all copies go to the new floor
          type_code:         c.type_code,
          primary_attribute: c.primary_attribute,
          label:             c.label,
          asset_id:          c.asset_id,
          x_position:        c.x_position,
          y_position:        c.y_position,
          status:            c.status ?? 'ok',
          notes:             c.notes,
          created_by:        userId,
          updated_by:        userId,
          // linked_component_ref omitted — stale after floor change
        });

        idMap[c.id] = newComp;

        const attrs = allAttrs.filter(a => a.component_id === c.id);
        if (attrs.length > 0) {
          await api.createMany('component_attributes', attrs.map(a => ({
            component_id:      newComp.id,
            type_attribute_id: a.type_attribute_id,
            value:             a.value,
          })), false);
        }
        copied++;
      }
      if (onProgress) onProgress(copied, total);
    }

    // ── Copy component links ──────────────────────────────────────────────
    // For each source component that has links, create equivalent links on
    // the new components. to_component_ref strings are rewritten when they
    // point to another component in the source plan (internal link), so that
    // the new link resolves to the corresponding new-floor copy.
    // Links pointing outside the source plan are kept as-is.
    const srcIds = srcComponents.map(c => c.id);
    if (srcIds.length > 0) {
      let allLinks = [];
      try {
        allLinks = await api.get('component_links');
      } catch {
        // component_links table may not exist in older deployments — skip silently
        logger('component_links not available — skipping link copy');
      }

      const srcLinks = allLinks.filter(l => srcIds.includes(l.from_component_id));

      if (srcLinks.length > 0) {
        // Pre-build a map: old to_component_ref → new to_component_ref.
        // Refs are stored in the short format used by the link dropdown:
        //   "{floorShortName}/{typeInitial}/{assetId}"  e.g. "G/FD/FD-042"
        // Only the floor segment changes; initial and assetId stay the same.
        const newFloor   = floors.find(f => f.id === newFloorId);
        const newFloorSN = newFloor?.short_name ?? '?';

        const refRemap = {};
        for (const c of srcComponents) {
          const srcFloor   = floors.find(f => f.id === c.floor_id);
          const srcFloorSN = srcFloor?.short_name ?? '?';
          const type       = types.find(t => t.code === c.type_code);
          const initial    = type?.initial ?? '?';
          const assetId    = c.asset_id || c.label || c.id?.slice(0, 8) || '?';

          const oldRef = `${srcFloorSN}/${initial}/${assetId}`;
          const newRef = `${newFloorSN}/${initial}/${assetId}`;
          if (oldRef !== newRef) refRemap[oldRef] = newRef;
        }

        const linkRows = srcLinks
          .map(link => {
            const newFromId = idMap[link.from_component_id]?.id;
            if (!newFromId) return null;   // guard — should not happen
            return {
              from_component_id: newFromId,
              to_component_ref:  refRemap[link.to_component_ref] ?? link.to_component_ref,
              link_type:         link.link_type ?? null,
              created_by:        userId,
            };
          })
          .filter(Boolean);

        if (linkRows.length > 0) {
          await api.createMany('component_links', linkRows, false);
          logger(`Copied ${linkRows.length} component link(s)`);
        }
      }
    }

    update(s => ({
      ...s,
      plans: [...s.plans, newPlan].sort((a, b) =>
        (a.building ?? '').localeCompare(b.building ?? ''))
    }));
    logger(`Copied plan ${sourcePlanId} → ${newPlan.id}, ${copied} components`);
    return { plan: newPlan, copied };
  }

  // ── Delete a plan ─────────────────────────────────────────────────────
  // DB should cascade-delete spaces and annotations; local state is cleaned up too.
  async function deletePlan(planId) {
    requireUserId();
    await api.delete('plans', planId);
    update(s => ({
      ...s,
      plans:       s.plans.filter(p => p.id !== planId),
      spaces:      s.spaces.filter(sp => sp.plan_id !== planId),
      annotations: s.annotations.filter(a => a.plan_id !== planId),
    }));
    logger('Deleted plan:', planId);
  }

  return {
    uploadPlanImage,
    updatePlanScale,
    createPlan,
    updatePlanInfo,
    replacePlanImage,
    copyPlan,
    deletePlan,
  };
}
