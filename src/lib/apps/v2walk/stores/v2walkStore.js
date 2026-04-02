// src/lib/apps/v2walk/stores/v2walkStore.js
// V2 Walk store — mirrors walkStore.js but operates on the v2 schema:
//   components / component_types / floors  (not plan_elements)
//   v2_walk_sessions                       (not walk_sessions)
//   component_inspections                  (photo_urls array, checklist_results)

import { writable, get } from 'svelte/store';
import { getLogger }     from '$lib/utils/logger';
import { logAudit }      from '$lib/utils/auditLogger';
import { api }           from '$lib/utils/api';
import { supabase }      from '$lib/supabaseClient';
import { sortByFloor }   from '$lib/utils/floorSorting';

const logger = getLogger('v2walkStore');

function audit(eventType, targetType, targetId, targetName, data = {}) {
  logAudit(eventType, targetType, targetId, targetName, {
    appId: 'v2walk', eventCategory: 'v2walk',
    severity: eventType === 'delete' ? 'warning' : 'info',
    ...data,
  });
}

// ── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_STATE = {
  // Static data loaded once
  facilities:       [],
  floors:           [],      // all floors ordered by level_order
  systems:          [],
  types:            [],
  attrDefs:         {},      // { typeId: type_attributes[] } — effective (inherited+own)
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

// ── Auth helpers ──────────────────────────────────────────────────────────────

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

// ── Build walk component list ─────────────────────────────────────────────────
// Given the full components list for a floor and the session's type_filter + emergency_only,
// returns the filtered and sorted component list for walking.

function buildWalkComponents(floorComponents, typeFilter, emergencyOnly, allComponentAttrs = {}) {
  let list = floorComponents.filter(c => {
    // Type filter: must be in the selected type_codes array
    if (!typeFilter.includes(c.type_code)) return false;
    // Emergency-only: check component_attributes for attr_name='emergency', value='true'
    // (attr_name is enriched into allComponentAttrs rows during load()).
    if (emergencyOnly) {
      const isEmergency = (allComponentAttrs[c.id] ?? [])
        .some(a => a.attr_name === 'emergency' && a.value === 'true');
      if (!isEmergency) return false;
    }
    return true;
  });
  return list.sort((a, b) =>
    (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true })
  );
}

// ── Floor progress helpers ────────────────────────────────────────────────────

function initFloorProgress(buildingFloors, allComponents, typeFilter, emergencyOnly, allComponentAttrs) {
  const progress = {};
  for (const floor of buildingFloors) {
    const comps = buildWalkComponents(
      allComponents[floor.id] ?? [], typeFilter, emergencyOnly, allComponentAttrs
    );
    progress[floor.id] = { inspected: 0, total: comps.length };
  }
  return progress;
}

function calcFloorProgress(buildingFloors, allComponents, typeFilter, emergencyOnly, allComponentAttrs, inspections) {
  const progress = {};
  for (const floor of buildingFloors) {
    const comps = buildWalkComponents(
      allComponents[floor.id] ?? [], typeFilter, emergencyOnly, allComponentAttrs
    );
    progress[floor.id] = {
      total:     comps.length,
      inspected: comps.filter(c => inspections[c.id]).length,
    };
  }
  return progress;
}

// ── Store factory ─────────────────────────────────────────────────────────────

function createV2WalkStore() {
  const { subscribe, update } = writable(INITIAL_STATE);

  function getState() { return get({ subscribe }); }

  // ── Initial load ────────────────────────────────────────────────────────────

  async function load() {
    logger('Loading v2walk data…');
    update(s => ({ ...s, loading: true, error: null }));
    try {
      // Load hierarchy + components in parallel
      const [facilities, floors, systems, types, defs, plans, components, componentAttrs] =
        await Promise.all([
          api.get('facilities'),
          api.get('floors', { orderBy: 'level_order', ascending: true }),
          api.get('building_systems',  { orderBy: 'presentation_order' }),
          api.get('component_types',   { orderBy: 'presentation_order' }),
          api.get('type_attributes',   { orderBy: 'presentation_order' }),
          api.get('plans',             { orderBy: 'building', ascending: true }),
          api.get('components',        { orderBy: 'asset_id', ascending: true }),
          api.get('component_attributes'),
        ]);

      // Build attrDefs: effective attribute set per type
      const attrDefs = {};
      const systemDefs = defs.filter(d => d.building_system_id != null);
      const typeDefs   = defs.filter(d => d.component_type_id  != null);
      for (const t of types) {
        const inherited = systemDefs
          .filter(d => d.building_system_id === t.building_system_id)
          .map(a => ({ ...a, _scope: 'system' }));
        const own = typeDefs
          .filter(d => d.component_type_id === t.id)
          .map(a => ({ ...a, _scope: 'type' }));
        attrDefs[t.id] = [...inherited, ...own]
          .sort((a, b) => a.presentation_order - b.presentation_order);
      }

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
        facilities, floors, systems, types, attrDefs,
        plans, allComponents, allComponentAttrs,
        loading: false,
      }));

      logger('✅ v2walk data loaded:',
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

  // ── Sessions ────────────────────────────────────────────────────────────────

  async function loadSessions() {
    update(s => ({ ...s, loading: true }));
    try {
      const userId   = await getCurrentUserId();
      const sessions = await api.get('v2_walk_sessions', {
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
    return api.create('v2_walk_sessions', {
      ...data,
      inspector_name: inspectorName,
      status:         'open',
      created_by:     userId,
      updated_by:     userId,
    });
  }

  // ── Start single-floor session ───────────────────────────────────────────────

  async function startSession({ building, floor, typeFilter, emergencyOnly, sessionName, sessionType, preset }) {
    logger('startSession:', { building, floor: floor?.short_name, typeFilter });
    const state = getState();
    const floorComponents = state.allComponents[floor.id] ?? [];
    const walkComponents  = buildWalkComponents(
      floorComponents, typeFilter, emergencyOnly, state.allComponentAttrs ?? {}
    );

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

  // ── Start building-wide session ──────────────────────────────────────────────

  async function startBuildingWideSession({ building, typeFilter, emergencyOnly, sessionName, sessionType, preset }) {
    logger('startBuildingWideSession:', { building, typeFilter });
    const state = getState();

    // Get floors for this building (via facilities→floors, but floors have facility_id)
    // We rely on the facility whose short_name or name matches building
    const facility     = state.facilities.find(f =>
      f.short_name === building || f.name === building
    );
    const buildingFloors = state.floors.filter(f =>
      f.facility_id === (facility?.id ?? null)
    );

    if (buildingFloors.length === 0) throw new Error(`No floors found for building: ${building}`);

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

    const firstFloor     = buildingFloors[0];
    const walkComponents = buildWalkComponents(
      state.allComponents[firstFloor.id] ?? [], typeFilter, emergencyOnly, state.allComponentAttrs ?? {}
    );
    const floorProgress = initFloorProgress(
      buildingFloors, state.allComponents, typeFilter, emergencyOnly, state.allComponentAttrs ?? {}
    );

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

  // ── Resume ───────────────────────────────────────────────────────────────────

  async function resumeSession(session) {
    logger('resumeSession:', session.id);
    const state = getState();
    const typeFilter    = Array.isArray(session.type_filter)
      ? session.type_filter
      : (JSON.parse(session.type_filter || '[]'));
    const emergencyOnly = session.emergency_only ?? false;

    // Load existing inspections map
    const inspRows = await api.get('component_inspections', {
      filters:   { v2_walk_session_id: session.id },
      orderBy:   'inspected_at',
      ascending: true,
    });
    const inspections = {};
    for (const r of inspRows) {
      inspections[r.component_id] = r; // keep latest (rows are asc)
    }

    if (session.session_scope === 'building') {
      const facility      = state.facilities.find(f =>
        f.short_name === session.building || f.name === session.building
      );
      const buildingFloors = state.floors.filter(f => f.facility_id === (facility?.id ?? null));

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

  // ── Pause / complete / close ─────────────────────────────────────────────────

  async function pauseSession() {
    update(s => ({ ...s, ...RESET_SESSION_STATE }));
    await loadSessions();
  }

  async function completeSession(sessionId, notes = '') {
    const userId = await getCurrentUserId();
    await api.update('v2_walk_sessions', sessionId, {
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

  // ── Navigation ───────────────────────────────────────────────────────────────

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
        // End of floor — advance to next floor for building-wide
        if (s.activeSession?.session_scope === 'building' && s.buildingFloors.length > 0) {
          const ci = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
          if (ci >= 0 && ci < s.buildingFloors.length - 1) {
            const nextFloor     = s.buildingFloors[ci + 1];
            const typeFilter    = s.activeSession._typeFilter ?? [];
            const emergencyOnly = s.activeSession._emergencyOnly ?? false;
            const walkComponents = buildWalkComponents(
              s.allComponents[nextFloor.id] ?? [], typeFilter, emergencyOnly, s.allComponentAttrs ?? {}
            );
            return { ...s, currentFloor: nextFloor, walkComponents, currentIndex: 0 };
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
        if (s.activeSession?.session_scope === 'building' && s.buildingFloors.length > 0) {
          const ci = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
          if (ci > 0) {
            const prevFloor     = s.buildingFloors[ci - 1];
            const typeFilter    = s.activeSession._typeFilter ?? [];
            const emergencyOnly = s.activeSession._emergencyOnly ?? false;
            const walkComponents = buildWalkComponents(
              s.allComponents[prevFloor.id] ?? [], typeFilter, emergencyOnly, s.allComponentAttrs ?? {}
            );
            return { ...s, currentFloor: prevFloor, walkComponents, currentIndex: walkComponents.length - 1 };
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
    const ci = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
    return ci === s.buildingFloors.length - 1 && s.currentIndex >= s.walkComponents.length - 1;
  }

  function isAtStartOfBuilding() {
    const s = getState();
    if (s.activeSession?.session_scope !== 'building') return false;
    const ci = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
    return ci === 0 && s.currentIndex === 0;
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

  // ── Inspections ──────────────────────────────────────────────────────────────

  // Upsert an inspection record.
  // photo_urls: array of strings (already uploaded); checklist: { attrId: bool }
  async function recordInspection({ componentId, result, notes, photoUrls = [], checklistResults = {} }) {
    logger('recordInspection:', componentId, result);
    const userId = await getCurrentUserId();
    const state  = getState();

    const existing = state.inspections[componentId];

    let inspection;
    if (existing) {
      inspection = await api.update('component_inspections', existing.id, {
        inspection_result: result,
        inspector_notes:   notes || null,
        photo_urls:        photoUrls,
        checklist_results: checklistResults,
        inspected_by:      userId,
        inspected_at:      new Date().toISOString(),
      });
    } else {
      inspection = await api.create('component_inspections', {
        v2_walk_session_id: state.activeSession.id,
        component_id:       componentId,
        inspection_result: result,
        inspector_notes:   notes || null,
        photo_urls:        photoUrls,
        checklist_results: checklistResults,
        inspected_by:      userId,
        inspected_at:      new Date().toISOString(),
      });

      // Update component's last_inspection_id
      await api.update('components', componentId, { last_inspection_id: inspection.id }, false);
    }

    // Also update component status to match result (ok→ok, problem, failed, inactive)
    await api.update('components', componentId, {
      status:     result,
      updated_by: userId,
    }, false);

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
        eventAction: existing ? 'v2walk_update_inspection' : 'v2walk_record_inspection',
        afterData: { componentId, result, session_id: state.activeSession.id },
      });

    return inspection;
  }

  async function loadComponentInspectionHistory(componentId) {
    try {
      return await api.get('component_inspections', {
        select:    '*, inspector:profiles!inspected_by(full_name), session:v2_walk_sessions!v2_walk_session_id(session_name, building, started_at)',
        filters:   { component_id: componentId },
        orderBy:   'inspected_at',
        ascending: false,
      });
    } catch { return []; }
  }

  async function loadSessionInspections(sessionId) {
    // Note: type_code on components is NOT a FK so we cannot join to component_types here.
    // Type name/colour/initial are resolved client-side from $v2walkStore.types.
    return api.get('component_inspections', {
      select:    '*, component:components!component_id(asset_id, label, type_code, status, floor:floors!floor_id(short_name, level_order))',
      filters:   { v2_walk_session_id: sessionId },
      orderBy:   'inspected_at',
      ascending: true,
    });
  }

  // ── Component editing (admin during walk) ────────────────────────────────────

  async function updateComponent(componentId, fields, attrValues = null) {
    const userId = await getCurrentUserId();
    const updated = await api.update('components', componentId, { ...fields, updated_by: userId });

    if (attrValues !== null) {
      // Delete-all + re-insert pattern (same as v2proto)
      const { error } = await supabase
        .from('component_attributes')
        .delete()
        .eq('component_id', componentId);
      if (error) throw error;

      if (Object.keys(attrValues).length > 0) {
        const rows = Object.entries(attrValues)
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .map(([type_attribute_id, value]) => ({
            component_id: componentId,
            type_attribute_id,
            value: String(value),
            created_by: userId,
            updated_by: userId,
          }));
        if (rows.length > 0) {
          const { error: insertErr } = await supabase.from('component_attributes').insert(rows);
          if (insertErr) throw insertErr;
        }
      }
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
      eventAction: 'v2walk_edit_component',
    });

    return updated;
  }

  // ── Repair list ──────────────────────────────────────────────────────────────

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

    return results.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'failed' ? -1 : 1;
      if ((a._floor?.level_order ?? 999) !== (b._floor?.level_order ?? 999))
        return (a._floor?.level_order ?? 999) - (b._floor?.level_order ?? 999);
      return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
    });
  }

  // ── Delete session ───────────────────────────────────────────────────────────

  async function deleteSession(sessionId) {
    const { error: inspErr } = await supabase
      .from('component_inspections')
      .delete()
      .eq('v2_walk_session_id', sessionId);
    if (inspErr) throw new Error('Failed to delete inspections: ' + inspErr.message);

    const { data, error: sessErr } = await supabase
      .from('v2_walk_sessions')
      .delete()
      .eq('id', sessionId)
      .select();
    if (sessErr) throw new Error('Failed to delete session: ' + sessErr.message);
    if (!data?.length) throw new Error('Session not deleted — check permissions');

    await loadSessions();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

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

export const v2walkStore = createV2WalkStore();
