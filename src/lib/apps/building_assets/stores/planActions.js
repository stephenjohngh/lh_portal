// src/lib/apps/building_assets/stores/planActions.js
// Plan domain: plans[], scale calibration, image upload, plan CRUD, copy.
// Receives the writable `update` function and the supabase client from buildingAssetsStore.

import { api }        from '$lib/utils/api';
import { getLogger }  from '$lib/utils/logger';
import { logAudit }   from '$lib/utils/auditLogger';
import { requireUserId } from './helpers.js';

const logger = getLogger('BuildingAssets');

const AUDIT_OPTS = { appId: 'building_assets', eventCategory: 'building_assets' };

// Factory — call once at store creation time.
// supabase: the supabase client (needed for Storage operations).
export function createPlanActions(update, supabase) {

  // -- Image upload ------------------------------------------------------
  // Uploads to the plan-images bucket and returns the public URL.
  async function uploadPlanImage(file) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `plans/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('plan-images').upload(path, file);
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    const { data: { publicUrl } } = supabase.storage.from('plan-images').getPublicUrl(path);
    return publicUrl;
  }

  // -- Scale calibration -------------------------------------------------
  // Saves a scale reference line and the image aspect ratio on a plan.
  // scaleRef:    { x1, y1, x2, y2, metres }  (or null to clear)
  // aspectRatio: number — native image W / H  (or null to clear)
  async function updatePlanScale(planId, scaleRef, aspectRatio) {
    const userId = requireUserId();
    const updated = await api.update('plans', planId, {
      scale_ref:          scaleRef,
      image_aspect_ratio: aspectRatio,
      updated_by:         userId
    });
    update(s => ({
      ...s,
      plans: s.plans.map(p => p.id === planId ? { ...p, ...updated } : p)
    }));
    logger('Updated plan scale:', planId,
      scaleRef ? `ref=${scaleRef.metres}m AR=${aspectRatio}` : 'cleared');
    logAudit('update', 'plan', planId, updated.name || updated.building || planId, {
      ...AUDIT_OPTS, eventAction: 'update_plan_scale',
      afterData: { scale_ref: scaleRef, image_aspect_ratio: aspectRatio }
    });
    return updated;
  }

  // -- Create a new plan (uploads image first) ---------------------------
  // data: { name, building, floor_id, description }
  async function createPlan(data, file) {
    const userId = requireUserId();
    const imageUrl = await uploadPlanImage(file);
    const plan = await api.create('plans', {
      name:        data.name?.trim()        || null,
      building:    data.building?.trim()    || '',
      floor_id:    data.floor_id            || null,
      description: data.description?.trim() || null,
      image_url:   imageUrl,
      created_by:  userId,
      updated_by:  userId
    });
    update(s => ({
      ...s,
      plans: [...s.plans, plan].sort((a, b) =>
        (a.building ?? '').localeCompare(b.building ?? ''))
    }));
    logger('Created plan:', plan.id, data.building);
    logAudit('create', 'plan', plan.id, plan.name || plan.building || plan.id, {
      ...AUDIT_OPTS, afterData: plan
    });
    return plan;
  }

  // -- Update plan metadata (no image change) ----------------------------
  async function updatePlanInfo(planId, data) {
    const userId = requireUserId();
    const updated = await api.update('plans', planId, {
      name:        data.name?.trim()        || null,
      building:    data.building?.trim()    || '',
      floor_id:    data.floor_id            || null,
      description: data.description?.trim() || null,
      updated_by:  userId
    });
    update(s => ({
      ...s,
      plans: s.plans.map(p => p.id === planId ? { ...p, ...updated } : p)
    }));
    logger('Updated plan info:', planId);
    logAudit('update', 'plan', planId, updated.name || updated.building || planId, {
      ...AUDIT_OPTS, afterData: updated
    });
    return updated;
  }

  // -- Replace the image on an existing plan ----------------------------
  // Also clears scale_ref and image_aspect_ratio — both must be re-calibrated.
  async function replacePlanImage(planId, file) {
    const userId = requireUserId();
    const imageUrl = await uploadPlanImage(file);
    const updated  = await api.update('plans', planId, {
      image_url:          imageUrl,
      image_aspect_ratio: null,
      scale_ref:          null,
      updated_by:         userId
    });
    update(s => ({
      ...s,
      plans: s.plans.map(p => p.id === planId ? { ...p, ...updated } : p)
    }));
    logger('Replaced plan image:', planId);
    logAudit('update', 'plan', planId, updated.name || updated.building || planId, {
      ...AUDIT_OPTS, eventAction: 'replace_plan_image',
      afterData: { image_url: imageUrl }
    });
    return updated;
  }

  // -- Copy a plan -------------------------------------------------------
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

    let sourcePlan = null;
    let floors     = [];
    let types      = [];
    update(s => {
      sourcePlan = s.plans.find(p => p.id === sourcePlanId);
      floors     = s.floors;
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
      created_by:         userId,
      updated_by:         userId
      // scale_ref intentionally omitted (reset to null)
    });

    const srcComponents = await api.getAll('components', { filters: { plan_id: sourcePlanId } });
    const total  = srcComponents.length;
    let copied   = 0;
    const srcIds = srcComponents.map(c => c.id);

    // oldId → newComp — built during the component loop, used for link remapping
    const idMap = {};

    if (total > 0) {
      // Fetch attributes only for these components (paginated past the 1000-row cap)
      const allAttrs = await api.getAllIn('component_attributes', 'component_id', srcIds);

      for (const c of srcComponents) {
        if (onProgress) onProgress(copied, total);

        const newComp = await api.create('components', {
          plan_id:               newPlan.id,
          floor_id:              newFloorId,   // all copies go to the new floor
          type_code:             c.type_code,
          primary_attribute:     c.primary_attribute,
          label:                 c.label,
          asset_id:              c.asset_id,
          x_position:            c.x_position,
          y_position:            c.y_position,
          status:                c.status ?? 'ok',
          notes:                 c.notes,
          inspection_sort_order: c.inspection_sort_order ?? null,
          created_by:            userId,
          updated_by:            userId,
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

    // -- Copy component links ----------------------------------------------
    // For each source component that has links, create equivalent links on
    // the new components. to_component_ref strings are rewritten when they
    // point to another component in the source plan (internal link), so that
    // the new link resolves to the corresponding new-floor copy.
    // Links pointing outside the source plan are kept as-is.
    if (srcIds.length > 0) {
      let srcLinks = [];
      try {
        srcLinks = await api.getAllIn('component_links', 'from_component_id', srcIds);
      } catch (err) {
        logger('component_links not available — skipping link copy', err.message);
      }

      if (srcLinks.length > 0) {
        // Pre-build a map: old to_component_ref → new to_component_ref.
        // Format: "{floorSN}/{initial}/{assetId}" — only the floor segment changes.
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

    // Fetch newly created attrs so the store shows them immediately (no reload needed)
    const newComponents  = Object.values(idMap);
    const newCompIds     = newComponents.map(c => c.id);
    const newAttrRows    = await api.getAllIn('component_attributes', 'component_id', newCompIds);
    const newComponentAttrs = {};
    for (const a of newAttrRows) {
      if (!newComponentAttrs[a.component_id]) newComponentAttrs[a.component_id] = [];
      newComponentAttrs[a.component_id].push(a);
    }

    update(s => ({
      ...s,
      plans:          [...s.plans, newPlan].sort((a, b) =>
        (a.building ?? '').localeCompare(b.building ?? '')),
      components:     [...s.components, ...newComponents],
      componentAttrs: { ...s.componentAttrs, ...newComponentAttrs },
    }));
    logger(`Copied plan ${sourcePlanId} → ${newPlan.id}, ${copied} components`);
    logAudit('create', 'plan', newPlan.id, newPlan.name || newPlan.building || newPlan.id, {
      ...AUDIT_OPTS, eventAction: 'copy_plan',
      afterData: { source_plan_id: sourcePlanId, components_copied: copied }
    });
    return { plan: newPlan, copied };
  }

  // -- Import components to an existing plan ----------------------------
  // Copies all components (and their attribute values + links) from
  // sourcePlanId onto an already-existing target plan.  No plan row is
  // created and no image is touched.  The target plan must already exist.
  // Returns { plan: targetPlan, copied } where plan is the target plan row.
  async function importComponentsToExistingPlan(sourcePlanId, targetPlanId, onProgress = null) {
    const userId = requireUserId();

    let targetPlan = null;
    let floors     = [];
    let types      = [];
    update(s => {
      targetPlan = s.plans.find(p => p.id === targetPlanId);
      floors     = s.floors;
      types      = s.types;
      return s;
    });
    if (!targetPlan) throw new Error('Target plan not found');

    const newFloorId    = targetPlan.floor_id ?? null;
    const srcComponents = await api.getAll('components', { filters: { plan_id: sourcePlanId } });
    const total         = srcComponents.length;
    let copied          = 0;
    const srcIds        = srcComponents.map(c => c.id);
    const idMap         = {};   // oldId → newComp

    if (onProgress) onProgress(0, total);

    if (total > 0) {
      // Fetch attributes only for these components (paginated past the 1000-row cap)
      const allAttrs = await api.getAllIn('component_attributes', 'component_id', srcIds);

      for (const c of srcComponents) {
        if (onProgress) onProgress(copied, total);

        const newComp = await api.create('components', {
          plan_id:               targetPlanId,
          floor_id:              newFloorId,
          type_code:             c.type_code,
          primary_attribute:     c.primary_attribute,
          label:                 c.label,
          asset_id:              c.asset_id,
          x_position:            c.x_position,
          y_position:            c.y_position,
          status:                c.status ?? 'ok',
          notes:                 c.notes,
          inspection_sort_order: c.inspection_sort_order ?? null,
          created_by:            userId,
          updated_by:            userId,
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

    // -- Remap and copy component links ----------------------------------
    if (srcIds.length > 0) {
      let srcLinks = [];
      try {
        srcLinks = await api.getAllIn('component_links', 'from_component_id', srcIds);
      } catch { /* skip if table absent */ }

      if (srcLinks.length > 0) {
        const newFloor   = floors.find(f => f.id === newFloorId);
        const newFloorSN = newFloor?.short_name ?? '?';

        const refRemap = {};
        for (const c of srcComponents) {
          const srcFloor   = floors.find(f => f.id === c.floor_id);
          const srcFloorSN = srcFloor?.short_name ?? '?';
          const type       = types.find(t => t.code === c.type_code);
          const initial    = type?.initial ?? '?';
          const assetId    = c.asset_id || c.label || c.id?.slice(0, 8) || '?';
          const oldRef     = `${srcFloorSN}/${initial}/${assetId}`;
          const newRef     = `${newFloorSN}/${initial}/${assetId}`;
          if (oldRef !== newRef) refRemap[oldRef] = newRef;
        }

        const linkRows = srcLinks
          .map(link => {
            const newFromId = idMap[link.from_component_id]?.id;
            if (!newFromId) return null;
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
          logger(`Imported ${linkRows.length} component link(s)`);
        }
      }
    }

    // Fetch newly created attrs so the store shows them immediately (no reload needed)
    const newComponents  = Object.values(idMap);
    const newCompIds     = newComponents.map(c => c.id);
    const newAttrRows    = await api.getAllIn('component_attributes', 'component_id', newCompIds);
    const newComponentAttrs = {};
    for (const a of newAttrRows) {
      if (!newComponentAttrs[a.component_id]) newComponentAttrs[a.component_id] = [];
      newComponentAttrs[a.component_id].push(a);
    }

    update(s => ({
      ...s,
      components:     [...s.components, ...newComponents],
      componentAttrs: { ...s.componentAttrs, ...newComponentAttrs },
    }));

    logger(`Imported ${copied} components from plan ${sourcePlanId} → existing plan ${targetPlanId}`);
    logAudit('create', 'plan', targetPlanId, targetPlan.name || targetPlan.building || targetPlanId, {
      ...AUDIT_OPTS, eventAction: 'import_components_to_plan',
      afterData: { source_plan_id: sourcePlanId, components_copied: copied }
    });

    return { plan: targetPlan, copied };
  }

  // -- Delete a plan -----------------------------------------------------
  // Removes all components placed on the plan first (resolves FK constraint),
  // then deletes spaces, annotations, and the plan row.
  // component_attributes cascade at the DB level so only the component rows
  // need to be deleted explicitly.
  async function deletePlan(planId) {
    requireUserId();
    let beforePlan   = null;
    let componentIds = [];
    update(s => {
      beforePlan   = s.plans.find(p => p.id === planId) ?? null;
      componentIds = s.components.filter(c => c.plan_id === planId).map(c => c.id);
      return s;
    });

    // Delete components on this plan before the plan itself.
    if (componentIds.length > 0) {
      await api.deleteMany('components', { plan_id: planId });
    }

    await api.delete('plans', planId);

    update(s => ({
      ...s,
      plans:       s.plans.filter(p => p.id !== planId),
      spaces:      s.spaces.filter(sp => sp.plan_id !== planId),
      annotations: s.annotations.filter(a => a.plan_id !== planId),
      components:  s.components.filter(c => c.plan_id !== planId),
      componentAttrs: Object.fromEntries(
        Object.entries(s.componentAttrs).filter(([k]) => !componentIds.includes(k))
      ),
    }));

    logger('Deleted plan:', planId,
      componentIds.length > 0 ? `(${componentIds.length} components removed)` : '');
    logAudit('delete', 'plan', planId,
      beforePlan?.name || beforePlan?.building || planId,
      { ...AUDIT_OPTS, beforeData: beforePlan,
        afterData: { components_deleted: componentIds.length } });
  }

  return {
    uploadPlanImage,
    updatePlanScale,
    createPlan,
    updatePlanInfo,
    replacePlanImage,
    copyPlan,
    importComponentsToExistingPlan,
    deletePlan,
  };
}
