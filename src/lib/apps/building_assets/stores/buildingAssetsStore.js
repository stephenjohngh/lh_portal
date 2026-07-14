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
import { resolveHierarchy }             from '$lib/utils/attrResolution.js';
import { createTypeHierarchyActions }   from './typeHierarchyActions.js';
import { createComponentActions }       from './componentActions.js';
import { createPlanActions }            from './planActions.js';
import { createSpaceActions }           from './spaceActions.js';
import { createAnnotationActions }      from './annotationActions.js';

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
    spaceOverrides:    [],   // space_component_overrides[] — manual membership include/exclude
    spaceUsages:       [],   // space_usages[] — admin-configurable usage list (value, presentation_order)
    annotations:       [],   // plan_annotations[] — free-form text labels on plans
    // UI state
    loading:           false,
    loadingComponents: false,
    error:             null
  });

  // -- Domain action sets -------------------------------------------------
  const typeActions  = createTypeHierarchyActions(update);
  const compActions  = createComponentActions(update);
  const planActions  = createPlanActions(update, supabase);
  const spaceActions = createSpaceActions(update);
  const annActions   = createAnnotationActions(update);

  // -- Top-level load -----------------------------------------------------
  // Loads the full type hierarchy, location hierarchy, plans, spaces and
  // annotations in one shot. Called once on app mount.
  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const [facilities, floors, systems, types, defs, options, regime, plans, spaces, spaceOverrides, annotations] =
        await Promise.all([
          api.get('facilities'),
          api.get('floors',              { orderBy: 'level_order',        ascending: true }),
          api.get('building_systems',    { orderBy: 'presentation_order' }),
          api.get('component_types',     { orderBy: 'presentation_order' }),
          api.get('type_attributes',     { orderBy: 'presentation_order' }),
          api.get('type_attribute_options', { orderBy: 'presentation_order' }),
          api.get('maintenance_regime'),
          api.get('plans',              { orderBy: 'building',           ascending: true }),
          api.get('spaces',             { orderBy: 'created_at',         ascending: false }),
          api.get('space_component_overrides'),
          api.get('plan_annotations',   { orderBy: 'created_at',         ascending: false })
        ]);

      const { attrDefs, systemAttrDefs, attrOptions, regimeMap } =
        resolveHierarchy(systems, types, defs, options, regime);

      // space_usages is loaded separately + gracefully — the table may not
      // exist yet (migration 163), and the UI falls back to the hardcoded list.
      let spaceUsages = [];
      try {
        spaceUsages = await api.get('space_usages', { orderBy: 'presentation_order', ascending: true });
      } catch (e) {
        logger('space_usages unavailable (pre-migration?) — using fallback list:', e.message);
      }

      update(s => ({
        ...s,
        facilities, floors,
        systems, types, attrDefs, systemAttrDefs, attrOptions,
        regime: regimeMap,
        plans, spaces, spaceOverrides, spaceUsages, annotations,
        loading: false
      }));
      logger('Loaded hierarchy, plans, spaces and annotations');
    } catch (err) {
      logger('Load error:', err.message);
      update(s => ({ ...s, loading: false, error: err.message }));
    }
  }

  // Refresh just the configurable space-usage list (after admin CRUD) —
  // lighter than a full load(). Degrades gracefully if the table is absent.
  async function loadSpaceUsages() {
    try {
      const spaceUsages = await api.get('space_usages', { orderBy: 'presentation_order', ascending: true });
      update(s => ({ ...s, spaceUsages }));
    } catch (e) {
      logger('loadSpaceUsages failed:', e.message);
    }
  }

  return {
    subscribe,
    load,
    loadSpaceUsages,
    ...typeActions,
    ...compActions,
    ...planActions,
    ...spaceActions,
    ...annActions,
  };
}

export const buildingAssetsStore = createBuildingAssetsStore();
