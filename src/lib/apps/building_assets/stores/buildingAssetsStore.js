// src/lib/apps/building_assets/stores/buildingAssetsStore.js
// Orchestrator: owns the single writable store and the top-level load() method,
// then composes all domain action modules into the exported singleton.
//
// Domain modules (each receives `update` so they can patch shared state):
//   typeHierarchyActions  — systems, types, attrs, options, reload
//   componentActions      — component CRUD, attributes, inspections
//   planActions           — plan CRUD, image upload, scale calibration
//   spaceActions          — spaces CRUD
//   annotationActions     — annotations CRUD

import { writable }                     from 'svelte/store';
import { api }                          from '#lib/utils/api.js';
import { getLogger }                    from '#lib/utils/logger.js';
import { supabase }                     from '#lib/supabaseClient.js';
import { resolveHierarchy }             from '#lib/utils/attrResolution.js';
import { toFloorGroups }                from '../utils/floorGroups.js';
import { createTypeHierarchyActions }   from './typeHierarchyActions.js';
import { createComponentActions }       from './componentActions.js';
import { createPlanActions }            from './planActions.js';
import { createSpaceActions }           from './spaceActions.js';
import { createAnnotationActions }      from './annotationActions.js';
import { storeLoader } from '#lib/utils/storeLoad.js';

const logger = getLogger('BuildingAssets');

function createBuildingAssetsStore() {
  const { subscribe, update } = writable({
    // Location hierarchy
    facilities:        [],   // facilities[]
    floors:            [],   // floors[] ordered by level_order
    floorGroups:       [],   // the Components tab's floor buttons (Admin → Floor groups)
    floorGroupsError:  '',   // said on the tab when they could not be read
    // Type hierarchy
    systems:           [],   // building_systems[]
    types:             [],   // component_types[]
    attrDefs:          {},   // { [typeId]: effective attrs (system-inherited + type-own) }
    systemAttrDefs:    {},   // { [systemId]: system-level type_attributes[] }
    attrOptions:       {},   // { [attrDefId]: type_attribute_options[] }
    // Component data
    components:        [],   // components[]
    componentAttrs:    {},   // { [componentId]: component_attributes[] }
    componentLinks:    {},   // { [componentId]: component_links[] }
    inspections:       {},   // { [componentId]: latest component_inspections row }
    // Plan / spatial data
    plans:             [],   // plans[]
    spaces:            [],   // spaces[] — named polygon areas on floor plans
    spaceOverrides:    [],   // space_component_overrides[] — manual membership include/exclude
    spaceTypes:        [],   // space_types[] — admin-configurable space type list (value, presentation_order)
    annotations:       [],   // schematic_annotations[] — free-form text labels on plans
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

  async function readFloorGroups() {
    return toFloorGroups(await api.getAll('floor_groups', { select: 'id, name, position, floor_group_floors(floor_id)', orderBy: 'position' }));
  }

  /** Re-read the floor groups after Admin changes them. */
  async function loadFloorGroups() {
    const floorGroups = await readFloorGroups();
    update((s) => ({ ...s, floorGroups, floorGroupsError: '' }));
  }

  // -- Top-level load -----------------------------------------------------
  // Loads the full type hierarchy, location hierarchy, plans, spaces and
  // annotations in one shot. Called once on app mount.
  // A failure stays on the store (`error`) and is not re-thrown, as before.
  const load = storeLoader(update, async () => {
      const [facilities, floors, systems, types, defs, options, plans, spaces, spaceOverrides, annotations] =
        await Promise.all([
          api.get('facilities'),
          api.get('floors',              { orderBy: 'level_order',        ascending: true }),
          api.get('building_systems',    { orderBy: 'presentation_order' }),
          api.get('component_types',     { orderBy: 'presentation_order' }),
          api.get('type_attributes',     { orderBy: 'presentation_order' }),
          api.get('type_attribute_options', { orderBy: 'presentation_order' }),
          api.get('schematics',              { orderBy: 'building',           ascending: true }),
          api.getAll('spaces',             { orderBy: 'created_at',         ascending: false }),
          api.getAll('space_component_overrides'),
          api.getAll('schematic_annotations',   { orderBy: 'created_at',         ascending: false })
        ]);

      const { attrDefs, systemAttrDefs, attrOptions } =
        resolveHierarchy(systems, types, defs, options);

      // space_types is loaded separately + gracefully — the table may not
      // exist yet (migrations 163/164), and the UI falls back to the hardcoded list.
      let spaceTypes = [];
      try {
        spaceTypes = await api.get('space_types', { orderBy: 'presentation_order', ascending: true });
      } catch (/** @type {any} */ e) {
        logger('space_types unavailable (pre-migration?) — using fallback list:', e.message);
      }

      // Floor groups fail alone: without them the Components tab offers All and
      // the floor list, which still works.
      let floorGroups = [];
      let floorGroupsError = '';
      try {
        floorGroups = await readFloorGroups();
      } catch (/** @type {any} */ e) {
        logger('floor_groups unavailable (pre-migration 280?):', e.message);
        floorGroupsError = 'The floor groups could not be read, so only All and the floor list are offered.';
      }

      return {
        facilities, floors, floorGroups, floorGroupsError,
        systems, types, attrDefs, systemAttrDefs, attrOptions,
        plans, spaces, spaceOverrides, spaceTypes, annotations,
      };
    },
    (loaded) => loaded,
    { what: 'the building assets', rethrow: false, log: logger });

  // Refresh just the configurable space-type list (after admin CRUD) —
  // lighter than a full load(). Degrades gracefully if the table is absent.
  async function loadSpaceTypes() {
    try {
      const spaceTypes = await api.get('space_types', { orderBy: 'presentation_order', ascending: true });
      update(s => ({ ...s, spaceTypes }));
    } catch (/** @type {any} */ e) {
      logger('loadSpaceTypes failed:', e.message);
    }
  }

  return {
    subscribe,
    load,
    loadSpaceTypes,
    loadFloorGroups,
    ...typeActions,
    ...compActions,
    ...planActions,
    ...spaceActions,
    ...annActions,
  };
}

export const buildingAssetsStore = createBuildingAssetsStore();
