// src/lib/apps/inspection/stores/inspectionStore.js
// State store for the inspection walk system.
// Tables: components, component_types, floors, walk_sessions, component_inspections.

import { writable, get } from 'svelte/store';
import { getLogger }     from '$lib/utils/logger';
import { logAudit }      from '$lib/utils/auditLogger';
import { api }           from '$lib/utils/api';
import { supabase }      from '$lib/supabaseClient';   // auth (getUser) only
// Components belong to the Building Assets app — reach them only through its
// public interface, so the write rules live in one place (../building_assets/public.js).
import {
  applyInspectionResult,
  updateComponent          as writeComponent,
  replaceComponentAttributes,
  createComponentInspection,
  updateComponentInspection,
} from '$lib/apps/building_assets/public.js';
import { resolveHierarchy }        from '$lib/utils/attrResolution.js';
import { sortByResultFloorAsset }  from '$lib/utils/componentSorting.js';
import { normalisePhotoUrl } from '$lib/utils/driveUtils.js';
// Polymorphic photo storage (media_attachments) goes through the shared module,
// not raw supabase queries.
import {
  listAttachments,
  addAttachments,
  purgeAttachments,
} from '$lib/utils/mediaAttachments.js';
import { deleteWalkSession } from '../public.js';   // session-delete cascade (shared)
import {
  buildWalkComponents,
  firstNonEmptyFloor,
  initFloorProgress,
  calcFloorProgress,
} from '../utils/inspectionWalk.js';

const logger = getLogger('inspectionStore');

// ── Shared photo helper ───────────────────────────────────────────────────────
// Batch-loads media_attachments for a set of component_inspection rows and
// injects a photo_urls string[] onto each row in-place.
// Preserves the same interface that components expect (row.photo_urls).
async function mergePhotosIntoRows(rows) {
  if (!rows || rows.length === 0) return;
  const ids = rows.map(r => r.id).filter(Boolean);
  if (ids.length === 0) return;

  let photos;
  try {
    photos = await listAttachments('component_inspection', ids);
  } catch (e) { logger('⚠ mergePhotos error:', e.message); return; }

  const byId = {};
  for (const p of (photos ?? [])) {
    (byId[p.entity_id] ??= []).push(normalisePhotoUrl(p.storage_url));
  }
  for (const row of rows) {
    row.photo_urls = byId[row.id] ?? [];
  }
}

function audit(eventType, targetType, targetId, targetName, data = {}) {
  logAudit(eventType, targetType, targetId, targetName, {
    appId: 'inspection', eventCategory: 'inspection',
    severity: eventType === 'delete' ? 'warning' : 'info',
    ...data,
  });
}

// -- Initial state -------------------------------------------------------------

const INITIAL_STATE = {
  // Static data loaded once
  facilities:       [],
  floors:           [],      // all floors ordered by level_order
  systems:          [],
  types:            [],
  attrDefs:         {},      // { typeId: type_attributes[] } — effective (inherited+own)
  attrOptions:      {},      // { attrDefId: type_attribute_options[] }
  plans:            [],      // for PlanViewer

  // All components, indexed by floorId for fast access
  allComponents:    {},      // { floorId: components[] }
  allComponentAttrs: {},     // { componentId: component_attributes[] }

  // Session state
  sessions:         [],
  activeSession:    null,
  walkComponents:   [],      // components in current walk scope (filtered + ordered)
  currentIndex:     0,
  inspections:      {},      // { componentId: inspection } — latest per component for this session
  buildingFloors:   [],      // ordered floor objects for building-wide sessions
  currentFloor:     null,    // active floor object (building-wide)
  floorProgress:    {},      // { floorId: { inspected, total } }

  loading:          false,
  error:            null,
};

const RESET_SESSION_STATE = {
  activeSession:  null,
  walkComponents: [],
  currentIndex:   0,
  inspections:    {},
  buildingFloors: [],
  currentFloor:   null,
  floorProgress:  {},
};

// -- Auth helpers --------------------------------------------------------------

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function getCurrentUserName(userId) {
  try {
    const rows = await api.get('profiles', { select: 'full_name', filters: { id: userId } });
    return rows?.[0]?.full_name ?? null;
  } catch { return null; }
}

// -- Store factory -------------------------------------------------------------

function createInspectionStore() {
  const { subscribe, update } = writable(INITIAL_STATE);

  function getState() { return get({ subscribe }); }

  // -- Initial load ------------------------------------------------------------

  async function load() {
    logger('Loading inspection data…');
    update(s => ({ ...s, loading: true, error: null }));
    try {
      // Load hierarchy + components in parallel
      const [facilities, floors, systems, types, defs, options, plans, components, componentAttrs] =
        await Promise.all([
          api.get('facilities'),
          api.get('floors', { orderBy: 'level_order', ascending: true }),
          api.get('building_systems',  { orderBy: 'presentation_order' }),
          api.get('component_types',   { orderBy: 'presentation_order' }),
          api.get('type_attributes',   { orderBy: 'presentation_order' }),
          api.get('type_attribute_options', { orderBy: 'priority_override', ascending: true }),
          api.get('plans',             { orderBy: 'building', ascending: true }),
          // components + component_attributes can exceed PostgREST's 1000-row
          // cap in production — paginate via getAll (pages by id for stability).
          api.getAll('components'),
          api.getAll('component_attributes'),
        ]);

      // Restore asset_id ordering (getAll pages by id, not asset_id)
      components.sort((a, b) =>
        (a.asset_id ?? '').localeCompare(b.asset_id ?? '', undefined, { numeric: true }));

      // Build attrDefs + attrOptions: effective attribute set per type with dropdown/radio options
      const { attrDefs, attrOptions } = resolveHierarchy(systems, types, defs, options);

      // Build a map from type_attribute_id → name so we can enrich component_attributes
      // rows with attr_name (component_attributes has no name column — it's in type_attributes).
      const attrIdToName = {};
      for (const d of defs) attrIdToName[d.id] = d.name;

      // Index component_attributes by componentId, enriched with attr_name
      const allComponentAttrs = {};
      for (const a of componentAttrs) {
        if (!allComponentAttrs[a.component_id]) allComponentAttrs[a.component_id] = [];
        allComponentAttrs[a.component_id].push({
          ...a,
          attr_name: attrIdToName[a.type_attribute_id] ?? null,
        });
      }

      // Index components by floorId
      const allComponents = {};
      for (const c of components) {
        if (!allComponents[c.floor_id]) allComponents[c.floor_id] = [];
        allComponents[c.floor_id].push(c);
      }

      update(s => ({
        ...s,
        facilities, floors, systems, types, attrDefs, attrOptions,
        plans, allComponents, allComponentAttrs,
        loading: false,
      }));

      logger('✅ inspection data loaded:',
        'facilities:', facilities.length,
        '| floors:', floors.length,
        '| types:', types.length,
        '| components:', components.length,
        '| componentAttrs:', componentAttrs.length,
      );
      logger('🗺 allComponents keys (floorIds):', Object.keys(allComponents));
      logger('🏢 facilities:', facilities.map(f => `${f.name} (${f.id})`));
      logger('🪜 floors sample:', floors.slice(0,3).map(f => `${f.short_name} facility_id=${f.facility_id}`));
      const nullFloorComponents = components.filter(c => !c.floor_id).length;
      if (nullFloorComponents > 0) logger('⚠️ components with no floor_id:', nullFloorComponents);
    } catch (err) {
      logger('❌ load:', err.message);
      update(s => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }

  // -- Sessions ----------------------------------------------------------------

  async function loadSessions() {
    update(s => ({ ...s, loading: true }));
    try {
      const userId   = await getCurrentUserId();
      const sessions = await api.get('walk_sessions', {
        filters:   { created_by: userId },
        orderBy:   'started_at',
        ascending: false,
      });
      update(s => ({ ...s, sessions, loading: false }));
      return sessions;
    } catch (err) {
      update(s => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }

  async function createSession(data) {
    const userId        = await getCurrentUserId();
    const inspectorName = await getCurrentUserName(userId);
    return api.create('walk_sessions', {
      ...data,
      inspector_name: inspectorName,
      status:         'open',
      created_by:     userId,
      updated_by:     userId,
    });
  }

  // -- Start single-floor session -----------------------------------------------

  async function startSession({ building, floor, typeFilter, emergencyOnly, sessionName, sessionType, preset, targetComponentId }) {
    logger('startSession:', { building, floor: floor?.short_name, typeFilter, targetComponentId });
    const state = getState();
    const floorComponents = state.allComponents[floor.id] ?? [];
    let walkComponents  = buildWalkComponents(
      floorComponents, typeFilter, emergencyOnly, state.allComponentAttrs ?? {}
    );
    // Repair sessions target a single specific component — limit the walk list
    // to it. Source it directly from the floor's components so a targeted repair
    // can still reach an "internal" component (walk order 0) that buildWalkComponents
    // excludes from normal walks.
    if (sessionType === 'repair' && targetComponentId) {
      const target = floorComponents.find(c => c.id === targetComponentId);
      walkComponents = target ? [target] : [];
    }

    const session = await createSession({
      session_type:              sessionType,
      session_scope:             'single_floor',
      session_preset:            preset,
      type_filter:               JSON.stringify(typeFilter),
      emergency_only:            emergencyOnly,
      building,
      floor_id:                  floor.id,
      session_name:              sessionName,
      total_components_count:    walkComponents.length,
      inspected_components_count: 0,
    });

    update(s => ({
      ...s,
      activeSession:  { ...session, _floorObj: floor },
      walkComponents,
      currentIndex:   0,
      inspections:    {},
      buildingFloors: [],
      currentFloor:   floor,
      floorProgress:  {},
    }));

    return session;
  }

  // -- Start building-wide session ----------------------------------------------

  async function startBuildingWideSession({ building, typeFilter, emergencyOnly, sessionName, sessionType, preset }) {
    logger('startBuildingWideSession:', { building, typeFilter });
    const state = getState();

    // Get floors for this building (via facilities→floors, but floors have facility_id)
    // We rely on the facility whose short_name or name matches building
    const facility     = state.facilities.find(f =>
      f.short_name === building || f.name === building
    );
    // Only include floors with walk_order set (null = excluded from walks e.g. roof, external).
    // Sort by walk_order so the walk sequence matches the configured order.
    const buildingFloors = state.floors
      .filter(f => f.facility_id === (facility?.id ?? null) && f.walk_order != null)
      .sort((a, b) => a.walk_order - b.walk_order);

    if (buildingFloors.length === 0) throw new Error(`No walkable floors found for building: ${building}. Set walk_order on floors in Admin.`);

    const total = buildingFloors.reduce((n, floor) =>
      n + buildWalkComponents(
        state.allComponents[floor.id] ?? [], typeFilter, emergencyOnly, state.allComponentAttrs ?? {}
      ).length, 0
    );

    const session = await createSession({
      session_type:              sessionType,
      session_scope:             'building',
      session_preset:            preset,
      type_filter:               JSON.stringify(typeFilter),
      emergency_only:            emergencyOnly,
      building,
      floor_id:                  null,
      session_name:              sessionName,
      total_components_count:    total,
      inspected_components_count: 0,
    });

    const attrs         = state.allComponentAttrs ?? {};
    const floorProgress = initFloorProgress(
      buildingFloors, state.allComponents, typeFilter, emergencyOnly, attrs
    );
    // Start on the first floor that actually has matching components
    const firstResult   = firstNonEmptyFloor(buildingFloors, state.allComponents, typeFilter, emergencyOnly, attrs, 0, 1);
    const firstFloor    = firstResult?.floor    ?? buildingFloors[0];
    const walkComponents = firstResult?.components ?? [];

    update(s => ({
      ...s,
      activeSession:  { ...session, _typeFilter: typeFilter, _emergencyOnly: emergencyOnly },
      buildingFloors,
      currentFloor:   firstFloor,
      floorProgress,
      walkComponents,
      currentIndex:   0,
      inspections:    {},
    }));

    return session;
  }

  // -- Resume -------------------------------------------------------------------

  async function resumeSession(session) {
    logger('resumeSession:', session.id);
    const state = getState();
    const typeFilter    = Array.isArray(session.type_filter)
      ? session.type_filter
      : (JSON.parse(session.type_filter || '[]'));
    const emergencyOnly = session.emergency_only ?? false;

    // Load existing inspections map. A building-wide session can exceed the
    // 1000-row cap, so paginate (getAll pages by id) and sort asc client-side.
    const inspRows = await api.getAll('component_inspections', {
      filters: { walk_session_id: session.id },
    });
    inspRows.sort((a, b) => new Date(a.inspected_at) - new Date(b.inspected_at));
    // Attach photo URLs from media_attachments (replaces JSONB photo_urls column)
    await mergePhotosIntoRows(inspRows);
    const inspections = {};
    for (const r of inspRows) {
      inspections[r.component_id] = r; // keep latest (rows are asc)
    }

    if (session.session_scope === 'building') {
      const facility      = state.facilities.find(f =>
        f.short_name === session.building || f.name === session.building
      );
      const buildingFloors = state.floors
        .filter(f => f.facility_id === (facility?.id ?? null) && f.walk_order != null)
        .sort((a, b) => a.walk_order - b.walk_order);

      const floorProgress = calcFloorProgress(
        buildingFloors, state.allComponents, typeFilter, emergencyOnly, state.allComponentAttrs ?? {}, inspections
      );

      const currentFloor = buildingFloors.find(f =>
        floorProgress[f.id].inspected < floorProgress[f.id].total
      ) ?? buildingFloors[0];

      const walkComponents = buildWalkComponents(
        state.allComponents[currentFloor.id] ?? [], typeFilter, emergencyOnly, state.allComponentAttrs ?? {}
      );

      update(s => ({
        ...s,
        activeSession:  { ...session, _typeFilter: typeFilter, _emergencyOnly: emergencyOnly },
        buildingFloors,
        currentFloor,
        floorProgress,
        walkComponents,
        currentIndex:   0,
        inspections,
      }));
    } else {
      const floor = state.floors.find(f => f.id === session.floor_id);
      if (!floor) throw new Error('Floor not found for session');
      const walkComponents = buildWalkComponents(
        state.allComponents[floor.id] ?? [], typeFilter, emergencyOnly, state.allComponentAttrs ?? {}
      );
      update(s => ({
        ...s,
        activeSession:  { ...session, _floorObj: floor },
        walkComponents,
        currentIndex:   0,
        inspections,
        buildingFloors: [],
        currentFloor:   floor,
        floorProgress:  {},
      }));
    }
  }

  // -- Pause / complete / close -------------------------------------------------

  async function pauseSession() {
    update(s => ({ ...s, ...RESET_SESSION_STATE }));
    await loadSessions();
  }

  async function completeSession(sessionId, notes = '') {
    const userId = await getCurrentUserId();
    await api.update('walk_sessions', sessionId, {
      status:     'closed',
      closed_at:  new Date().toISOString(),
      notes:      notes || null,
      updated_by: userId,
    }, false);
    update(s => ({ ...s, ...RESET_SESSION_STATE }));
    await loadSessions();
  }

  async function closeSession(sessionId, notes = '') {
    if (!sessionId) return;
    await completeSession(sessionId, notes);
  }

  // -- Navigation ---------------------------------------------------------------

  function goToIndex(index) {
    update(s => ({
      ...s,
      currentIndex: Math.max(0, Math.min(index, s.walkComponents.length - 1)),
    }));
  }

  function goNext() {
    update(s => {
      const next = s.currentIndex + 1;
      if (next >= s.walkComponents.length) {
        // End of floor — advance to next non-empty floor for building-wide
        if (s.activeSession?.session_scope === 'building' && s.buildingFloors.length > 0) {
          const ci            = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
          const typeFilter    = s.activeSession._typeFilter ?? [];
          const emergencyOnly = s.activeSession._emergencyOnly ?? false;
          const result        = firstNonEmptyFloor(
            s.buildingFloors, s.allComponents, typeFilter, emergencyOnly, s.allComponentAttrs ?? {}, ci + 1, 1
          );
          if (result) {
            return { ...s, currentFloor: result.floor, walkComponents: result.components, currentIndex: 0 };
          }
        }
        return { ...s, currentIndex: s.walkComponents.length - 1 };
      }
      return { ...s, currentIndex: next };
    });
  }

  function goPrev() {
    update(s => {
      const prev = s.currentIndex - 1;
      if (prev < 0) {
        // Start of floor — go back to previous non-empty floor for building-wide
        if (s.activeSession?.session_scope === 'building' && s.buildingFloors.length > 0) {
          const ci            = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
          const typeFilter    = s.activeSession._typeFilter ?? [];
          const emergencyOnly = s.activeSession._emergencyOnly ?? false;
          const result        = firstNonEmptyFloor(
            s.buildingFloors, s.allComponents, typeFilter, emergencyOnly, s.allComponentAttrs ?? {}, ci - 1, -1
          );
          if (result) {
            return { ...s, currentFloor: result.floor, walkComponents: result.components, currentIndex: result.components.length - 1 };
          }
        }
        return { ...s, currentIndex: 0 };
      }
      return { ...s, currentIndex: prev };
    });
  }

  function isAtEndOfBuilding() {
    const s = getState();
    if (s.activeSession?.session_scope !== 'building') return false;
    if (s.currentIndex < s.walkComponents.length - 1) return false;
    // True only if there is no non-empty floor after the current one
    const ci            = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
    const typeFilter    = s.activeSession?._typeFilter    ?? [];
    const emergencyOnly = s.activeSession?._emergencyOnly ?? false;
    return !firstNonEmptyFloor(
      s.buildingFloors, s.allComponents, typeFilter, emergencyOnly, s.allComponentAttrs ?? {}, ci + 1, 1
    );
  }

  function isAtStartOfBuilding() {
    const s = getState();
    if (s.activeSession?.session_scope !== 'building') return false;
    if (s.currentIndex > 0) return false;
    // True only if there is no non-empty floor before the current one
    const ci            = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
    const typeFilter    = s.activeSession?._typeFilter    ?? [];
    const emergencyOnly = s.activeSession?._emergencyOnly ?? false;
    return !firstNonEmptyFloor(
      s.buildingFloors, s.allComponents, typeFilter, emergencyOnly, s.allComponentAttrs ?? {}, ci - 1, -1
    );
  }

  function getCurrentFloorProgress() {
    const s = getState();
    return {
      currentElement:    s.currentIndex + 1,
      totalElements:     s.walkComponents.length,
      currentFloor:      s.currentFloor,
      totalFloors:       s.buildingFloors.length,
      currentFloorIndex: s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id) + 1,
    };
  }

  // -- Inspections --------------------------------------------------------------

  // Upsert an inspection record.
  // photoUrls: array of storage URL strings (already uploaded via /api/media/upload).
  // Photos are stored in media_attachments, NOT as a JSONB column.
  async function recordInspection({ componentId, result, notes, photoUrls = [], checklistResults = {} }) {
    logger('recordInspection:', componentId, result);
    const userId = await getCurrentUserId();
    const state  = getState();
    const now    = new Date().toISOString();

    const existing = state.inspections[componentId];

    let inspection;
    if (existing) {
      inspection = await updateComponentInspection(existing.id, {   // shared (building_assets/public.js)
        inspection_result: result,
        inspector_notes:   notes || null,
        checklist_results: checklistResults,
        inspected_by:      userId,
        inspected_at:      now,
      });
      // Replace all photos for this inspection: purge the old ones (storage
      // files + rows) before the new set is inserted below.
      await purgeAttachments('component_inspection', existing.id);
    } else {
      inspection = await createComponentInspection({   // shared (building_assets/public.js)
        walk_session_id:   state.activeSession.id,
        component_id:      componentId,
        inspection_result: result,
        inspector_notes:   notes || null,
        checklist_results: checklistResults,
        inspected_by:      userId,
        inspected_at:      now,
      });
    }

    // Persist photos to media_attachments (for both create and update paths)
    await addAttachments('component_inspection', inspection.id, photoUrls, userId);
    // Inject photo_urls onto the in-memory record so UI state stays consistent.
    // Normalise Drive viewer URLs in case any were captured before the fix.
    inspection.photo_urls = photoUrls.map(normalisePhotoUrl);

    // Apply the inspection result to the component (status + last_inspection_id +
    // status_set_by/at) through the Building Assets public interface — the single
    // place that "inspection result → component status" rule lives.
    await applyInspectionResult(componentId, { result, inspectionId: inspection.id, userId });

    update(s => {
      const newInsp = { ...s.inspections, [componentId]: inspection };

      // Update floor progress for building-wide sessions
      let newFloorProgress = s.floorProgress;
      if (s.activeSession?.session_scope === 'building' && s.currentFloor) {
        const inspectedCount = s.walkComponents.filter(c => newInsp[c.id]).length;
        newFloorProgress = {
          ...s.floorProgress,
          [s.currentFloor.id]: {
            ...s.floorProgress[s.currentFloor.id],
            inspected: inspectedCount,
          },
        };
      }

      // Update in-memory component status
      const updatedAllComponents = { ...s.allComponents };
      for (const fid of Object.keys(updatedAllComponents)) {
        updatedAllComponents[fid] = updatedAllComponents[fid].map(c =>
          c.id === componentId ? { ...c, status: result } : c
        );
      }

      return {
        ...s,
        inspections:    newInsp,
        floorProgress:  newFloorProgress,
        allComponents:  updatedAllComponents,
        walkComponents: s.walkComponents.map(c =>
          c.id === componentId ? { ...c, status: result } : c
        ),
      };
    });

    const comp = state.walkComponents.find(c => c.id === componentId);
    audit(existing ? 'update' : 'create', 'component_inspection', inspection.id,
      comp?.asset_id ?? componentId, {
        eventAction: existing ? 'inspection_update_inspection' : 'inspection_record_inspection',
        afterData: { componentId, result, session_id: state.activeSession.id },
      });

    return inspection;
  }

  async function loadComponentInspectionHistory(componentId) {
    try {
      const rows = await api.get('component_inspections', {
        select:    '*, inspector:profiles!inspected_by(full_name), session:walk_sessions!walk_session_id(session_name, building, started_at)',
        filters:   { component_id: componentId },
        orderBy:   'inspected_at',
        ascending: false,
      });
      await mergePhotosIntoRows(rows);
      return rows;
    } catch { return []; }
  }

  async function loadSessionInspections(sessionId) {
    // Note: type_code on components is NOT a FK so we cannot join to component_types here.
    // Type name/colour/initial are resolved client-side from $inspectionStore.types.
    const rows = await api.get('component_inspections', {
      select:    '*, component:components!component_id(asset_id, label, type_code, status, floor:floors!floor_id(short_name, level_order))',
      filters:   { walk_session_id: sessionId },
      orderBy:   'inspected_at',
      ascending: true,
    });
    await mergePhotosIntoRows(rows);
    return rows;
  }

  // -- Component editing (admin during walk) ------------------------------------

  async function updateComponent(componentId, fields, attrValues = null) {
    const userId  = await getCurrentUserId();
    // Shared writes (../building_assets/public.js) — one implementation, no
    // duplicated delete-then-insert.
    const updated = await writeComponent(componentId, fields, userId);
    if (attrValues !== null) {
      await replaceComponentAttributes(componentId, attrValues);
    }

    update(s => {
      const updatedAllComponents = { ...s.allComponents };
      for (const fid of Object.keys(updatedAllComponents)) {
        updatedAllComponents[fid] = updatedAllComponents[fid].map(c =>
          c.id === componentId ? { ...c, ...updated } : c
        );
      }
      return {
        ...s,
        allComponents:  updatedAllComponents,
        walkComponents: s.walkComponents.map(c =>
          c.id === componentId ? { ...c, ...updated } : c
        ),
      };
    });

    audit('update', 'component', componentId, updated.asset_id ?? componentId, {
      eventAction: 'inspection_edit_component',
    });

    return updated;
  }

  // -- Repair list --------------------------------------------------------------

  async function getFailedComponents(building) {
    const state    = getState();
    const facility = state.facilities.find(f =>
      f.short_name === building || f.name === building
    );
    if (!facility) return [];

    const floorIds = state.floors
      .filter(f => f.facility_id === facility.id)
      .map(f => f.id);

    const results = [];
    for (const fid of floorIds) {
      const comps = (state.allComponents[fid] ?? []).filter(
        c => c.status === 'failed' || c.status === 'problem'
      );
      const floor = state.floors.find(f => f.id === fid);
      results.push(...comps.map(c => ({ ...c, _floor: floor })));
    }

    return results.sort((a, b) => sortByResultFloorAsset(
      { result: a.status, floor_order: a._floor?.level_order ?? 999, asset_id: a.asset_id },
      { result: b.status, floor_order: b._floor?.level_order ?? 999, asset_id: b.asset_id }
    ));
  }

  // -- Delete session -----------------------------------------------------------

  async function deleteSession(sessionId) {
    await deleteWalkSession(sessionId);   // shared cascade: photos → inspections → session (../public.js)
    await loadSessions();
  }

  // -- Public API ----------------------------------------------------------------

  return {
    subscribe,
    load,
    loadSessions,
    startSession,
    startBuildingWideSession,
    resumeSession,
    pauseSession,
    completeSession,
    closeSession,
    deleteSession,
    goToIndex,
    goNext,
    goPrev,
    isAtEndOfBuilding,
    isAtStartOfBuilding,
    getCurrentFloorProgress,
    recordInspection,
    loadComponentInspectionHistory,
    loadSessionInspections,
    updateComponent,
    getFailedComponents,
  };
}

export const inspectionStore = createInspectionStore();
