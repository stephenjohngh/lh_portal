// src/lib/apps/building_assets/stores/buildingAssetsStore.js
// Orchestrator: owns the single writable store and the top-level load() method,
// then composes all domain action modules into the exported singleton.
//
// Domain modules (each receives `update` so they can patch shared state):
//   typeHierarchyActions  — systems, types, attrs, options, regime, reload
//   componentActions      — component CRUD, attributes, inspections
//   planActions           — plan CRUD, image upload, scale calibration
//   spaceActions          — spaces CRUD
//   annotationActions     — annotations CRUD

import { writable }                     from 'svelte/store';
import { api }                          from '$lib/utils/api';
import { getLogger }                    from '$lib/utils/logger';
import { supabase }                     from '$lib/supabaseClient';
import { resolveHierarchy }             from '$lib/apps/v2/utils/attrResolution.js';
import { createTypeHierarchyActions }   from './typeHierarchyActions.js';
import { createComponentActions }       from './componentActions.js';
import { createPlanActions }            from './planActions.js';
import { createSpaceActions }           from './spaceActions.js';
import { createAnnotationActions }      from './annotationActions.js';

// Re-export helpers that components import directly from this module.
export { buildRef } from './helpers.js';

const logger = getLogger('BuildingAssets');

function createBuildingAssetsStore() {
  const { subscribe, update } = writable({
    // Location hierarchy
    facilities:        [],   // facilities[]
    floors:            [],   // floors[] ordered by level_order
    // Type hierarchy
    systems:           [],   // building_systems[]
    types:             [],   // component_types[]
    attrDefs:          {},   // { [typeId]: effective attrs (system-inherited + type-own) }
    systemAttrDefs:    {},   // { [systemId]: system-level type_attributes[] }
    attrOptions:       {},   // { [attrDefId]: type_attribute_options[] }
    regime:            {},   // { [typeId]: maintenance_regime[] }
    // Component data
    components:        [],   // components[]
    componentAttrs:    {},   // { [componentId]: component_attributes[] }
    componentLinks:    {},   // { [componentId]: component_links[] }
    inspections:       {},   // { [componentId]: latest component_inspections row }
    // Plan / spatial data
    plans:             [],   // plans[]
    spaces:            [],   // spaces[] — named polygon areas on floor plans
    annotations:       [],   // plan_annotations[] — free-form text labels on plans
    // UI state
    loading:           false,
    loadingComponents: false,
    error:             null
  });

  // ── Domain action sets ─────────────────────────────────────────────────
  const typeActions  = createTypeHierarchyActions(update);
  const compActions  = createComponentActions(update);
  const planActions  = createPlanActions(update, supabase);
  const spaceActions = createSpaceActions(update);
  const annActions   = createAnnotationActions(update);

  // ── Top-level load ─────────────────────────────────────────────────────
  // Loads the full type hierarchy, location hierarchy, plans, spaces and
  // annotations in one shot. Called once on app mount.
  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const [facilities, floors, systems, types, defs, options, regime, plans] =
        await Promise.all([
          api.get('facilities'),
          api.get('floors',              { orderBy: 'level_order',        ascending: true }),
          api.get('building_systems',    { orderBy: 'presentation_order' }),
          api.get('component_types',     { orderBy: 'presentation_order' }),
          api.get('type_attributes',     { orderBy: 'presentation_order' }),
          api.get('type_attribute_options', { orderBy: 'presentation_order' }),
          api.get('maintenance_regime'),
          api.get('plans',              { orderBy: 'building',           ascending: true })
        ]);

      const { attrDefs, systemAttrDefs, attrOptions, regimeMap } =
        resolveHierarchy(systems, types, defs, options, regime);

      // Graceful degradation: spaces (migration 018) and annotations (021)
      // may not yet exist in the DB.
      let spaces = [];
      try {
        spaces = await api.get('spaces', { orderBy: 'created_at', ascending: false });
      } catch {
        logger('Spaces table not available — run migration 018 to enable');
      }

      let annotations = [];
      try {
        annotations = await api.get('plan_annotations', { orderBy: 'created_at', ascending: false });
      } catch {
        logger('plan_annotations table not available — run migration 021 to enable');
      }

      update(s => ({
        ...s,
        facilities, floors,
        systems, types, attrDefs, systemAttrDefs, attrOptions,
        regime: regimeMap,
        plans, spaces, annotations,
        loading: false
      }));
      logger('Loaded hierarchy, plans, spaces and annotations');
    } catch (err) {
      logger('Load error:', err.message);
      update(s => ({ ...s, loading: false, error: err.message }));
    }
  }

  return {
    subscribe,
    load,
    ...typeActions,
    ...compActions,
    ...planActions,
    ...spaceActions,
    ...annActions,
  };
}

export const buildingAssetsStore = createBuildingAssetsStore();
