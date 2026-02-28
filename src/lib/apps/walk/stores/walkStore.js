// src/lib/apps/walk/stores/walkStore.js
// REFACTORED: Cleaned up, DRY principles, better abstractions

import { writable, get } from 'svelte/store';
import { getLogger } from '$lib/utils/logger';
import { api } from '$lib/utils/api';
import { supabase } from '$lib/supabaseClient';

const logger = getLogger('walkStore');

// ============================================================================
// Constants
// ============================================================================
const FLOOR_ORDER = { 'L': 0, 'U': 1, 'G': 2, '1': 3, '2': 4, '3': 5, '4': 6, '5': 7, '6': 8, '7': 9 };

const INITIAL_STATE = {
  plans: [],
  allElements: {},
  sessions: [],
  activeSession: null,
  walkElements: [],
  currentIndex: 0,
  inspections: {},
  buildingPlans: [],
  currentFloor: null,
  floorProgress: {},
  loading: false,
  error: null
};

const RESET_SESSION_STATE = {
  activeSession: null,
  walkElements: [],
  currentIndex: 0,
  inspections: {},
  buildingPlans: [],
  currentFloor: null,
  floorProgress: {}
};

// ============================================================================
// Helper Functions
// ============================================================================

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user?.id;
}

async function getCurrentUserName(userId) {
  try {
    const rows = await api.get('profiles', {
      select: 'full_name',
      filters: { id: userId }
    });
    return rows?.[0]?.full_name ?? null;
  } catch {
    return null;
  }
}

function sortPlansByFloor(plans) {
  return [...plans].sort((a, b) => 
    (FLOOR_ORDER[a.floor_level] ?? 999) - (FLOOR_ORDER[b.floor_level] ?? 999)
  );
}

function buildWalkElements(planElements, elementType, lightSubtypeFilter) {
  return planElements
    .filter(el => {
      if (el.element_type !== elementType) return false;
      if (elementType === 'light' && lightSubtypeFilter === 'emergency') {
        return el.emergency === true;
      }
      return true;
    })
    .sort((a, b) =>
      (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true })
    );
}

function calculateTotalElements(plans, allElements, elementType, lightSubtypeFilter) {
  return plans.reduce((sum, plan) => {
    const elements = buildWalkElements(
      allElements[plan.id] || [],
      elementType,
      lightSubtypeFilter
    );
    return sum + elements.length;
  }, 0);
}

function initializeFloorProgress(plans, allElements, elementType, lightSubtypeFilter) {
  return plans.reduce((progress, plan) => {
    const elements = buildWalkElements(
      allElements[plan.id] || [],
      elementType,
      lightSubtypeFilter
    );
    progress[plan.floor_level] = {
      inspected: 0,
      total: elements.length
    };
    return progress;
  }, {});
}

function calculateFloorProgress(plans, allElements, elementType, lightSubtypeFilter, inspections) {
  return plans.reduce((progress, plan) => {
    const elements = buildWalkElements(
      allElements[plan.id] || [],
      elementType,
      lightSubtypeFilter
    );
    const inspectedCount = elements.filter(el => inspections[el.id]).length;
    progress[plan.floor_level] = {
      inspected: inspectedCount,
      total: elements.length
    };
    return progress;
  }, {});
}

// ============================================================================
// Store Factory
// ============================================================================

function createWalkStore() {
  const { subscribe, update } = writable(INITIAL_STATE);

  // ── Utility ──────────────────────────────────────────────────────────────

  function getState() {
    return get({ subscribe });
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  async function loadPlans() {
    logger('Loading plans…');
    try {
      const plans = await api.get('plans', { orderBy: 'building', ascending: true });
      const allElements = {};
      
      // Load elements in parallel for better performance
      await Promise.all(
        plans.map(async (plan) => {
          allElements[plan.id] = await api.get('plan_elements', {
            filters: { plan_id: plan.id },
            orderBy: 'asset_id',
            ascending: true
          });
        })
      );
      
      update(s => ({ ...s, plans, allElements }));
      logger('✅ Loaded', plans.length, 'plans');
      return { plans, allElements };
    } catch (error) {
      logger('❌ loadPlans:', error.message);
      throw error;
    }
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  async function loadSessions() {
    logger('Loading walk sessions…');
    update(s => ({ ...s, loading: true }));
    try {
      const userId = await getCurrentUserId();
      const sessions = await api.get('walk_sessions', {
        filters: { created_by: userId },
        orderBy: 'started_at',
        ascending: false
      });
      update(s => ({ ...s, sessions, loading: false }));
      logger('✅ Loaded', sessions.length, 'sessions');
      return sessions;
    } catch (error) {
      logger('❌ loadSessions:', error.message);
      update(s => ({ ...s, loading: false, error: error.message }));
      throw error;
    }
  }

  async function createSession(sessionData) {
    const userId = await getCurrentUserId();
    const inspectorName = await getCurrentUserName(userId);
    
    return api.create('walk_sessions', {
      ...sessionData,
      inspector_name: inspectorName,
      status: 'open',
      created_by: userId,
      updated_by: userId
    });
  }

  // ── Start Building-Wide Session ──────────────────────────────────────────

  async function startBuildingWideSession({ building, elementType, sessionName = null, lightSubtypeFilter = null }) {
    logger('Starting building-wide session:', { building, elementType });
    
    try {
      const state = getState();
      const buildingPlans = sortPlansByFloor(
        state.plans.filter(p => p.building === building)
      );
      
      if (buildingPlans.length === 0) {
        throw new Error(`No plans found for building: ${building}`);
      }
      
      const totalElements = calculateTotalElements(
        buildingPlans,
        state.allElements,
        elementType,
        lightSubtypeFilter
      );
      
      const session = await createSession({
        session_scope: 'building',
        building_name: building,
        element_type: elementType,
        session_name: sessionName,
        light_subtype_filter: lightSubtypeFilter,
        total_elements_count: totalElements,
        inspected_elements_count: 0
      });
      
      logger('✅ Building-wide session created:', session.id);
      
      const firstPlan = buildingPlans[0];
      const walkElements = buildWalkElements(
        state.allElements[firstPlan.id] || [],
        elementType,
        lightSubtypeFilter
      );
      
      const floorProgress = initializeFloorProgress(
        buildingPlans,
        state.allElements,
        elementType,
        lightSubtypeFilter
      );
      
      update(s => ({
        ...s,
        activeSession: { ...session, planId: firstPlan.id },
        buildingPlans,
        currentFloor: firstPlan.floor_level,
        floorProgress,
        walkElements,
        currentIndex: 0,
        inspections: {}
      }));
      
      return session;
    } catch (error) {
      logger('❌ startBuildingWideSession:', error.message);
      throw error;
    }
  }

  // ── Start Single-Plan Session ────────────────────────────────────────────

  async function startSession({ 
    building, 
    floorLevel, 
    elementType, 
    startAssetId, 
    planId, 
    sessionName = null, 
    lightSubtypeFilter = null 
  }) {
    logger('Starting session:', { building, floorLevel, elementType });
    
    try {
      const state = getState();
      const walkElements = buildWalkElements(
        state.allElements[planId] || [],
        elementType,
        lightSubtypeFilter
      );

      const session = await createSession({
        plan_id: planId,
        session_scope: 'single_plan',
        building: building,
        building_name: building,
        floor_level: floorLevel,
        element_type: elementType,
        start_asset_id: startAssetId,
        session_name: sessionName,
        light_subtype_filter: lightSubtypeFilter,
        total_elements_count: walkElements.length,
        inspected_elements_count: 0
      });
      
      logger('✅ Session created:', session.id);

      const startIndex = startAssetId
        ? Math.max(0, walkElements.findIndex(el => el.asset_id === startAssetId))
        : 0;

      update(s => ({
        ...s,
        activeSession: { ...session, planId },
        walkElements,
        currentIndex: startIndex,
        inspections: {},
        buildingPlans: [],
        currentFloor: floorLevel,
        floorProgress: {}
      }));
      
      return session;
    } catch (error) {
      logger('❌ startSession:', error.message);
      throw error;
    }
  }

  // ── Close Session ────────────────────────────────────────────────────────

  async function closeSession(sessionId, notes = '') {
    logger('Closing session:', sessionId);
    const userId = await getCurrentUserId();
    
    try {
      await api.update('walk_sessions', sessionId, {
        status: 'closed',
        closed_at: new Date().toISOString(),
        notes: notes || null,
        updated_by: userId
      });
      
      update(s => ({ ...s, ...RESET_SESSION_STATE }));
      await loadSessions();
      logger('✅ Session closed');
    } catch (error) {
      logger('❌ closeSession:', error.message);
      throw error;
    }
  }

  // ── Resume Session ───────────────────────────────────────────────────────

  async function resumeBuildingSession(session, state) {
    const buildingPlans = sortPlansByFloor(
      state.plans.filter(p => p.building === session.building_name)
    );
    
    const inspections = await loadInspectionsMap(session.id);
    
    const floorProgress = calculateFloorProgress(
      buildingPlans,
      state.allElements,
      session.element_type,
      session.light_subtype_filter,
      inspections
    );
    
    // Find first incomplete floor or use first floor
    const currentPlan = buildingPlans.find(p => 
      floorProgress[p.floor_level].inspected < floorProgress[p.floor_level].total
    ) || buildingPlans[0];
    
    const walkElements = buildWalkElements(
      state.allElements[currentPlan.id] || [],
      session.element_type,
      session.light_subtype_filter
    );
    
    update(s => ({
      ...s,
      activeSession: { ...session, planId: currentPlan.id },
      buildingPlans,
      currentFloor: currentPlan.floor_level,
      floorProgress,
      walkElements,
      currentIndex: 0,
      inspections
    }));
  }

  async function resumeSinglePlanSession(session, state) {
    const plan = state.plans.find(p => p.id === session.plan_id) ||
                 state.plans.find(p => 
                   p.building === session.building && 
                   String(p.floor_level) === String(session.floor_level)
                 );
    
    if (!plan) throw new Error('No plan found for session');

    const walkElements = buildWalkElements(
      state.allElements[plan.id] || [],
      session.element_type,
      session.light_subtype_filter
    );

    const inspections = await loadInspectionsMap(session.id);

    update(s => ({
      ...s,
      activeSession: { ...session, planId: plan.id },
      walkElements,
      currentIndex: 0,
      inspections,
      currentFloor: session.floor_level
    }));
  }

  async function resumeSession(session) {
    logger('Resuming session:', session.id);
    
    try {
      const state = getState();
      
      if (session.session_scope === 'building') {
        await resumeBuildingSession(session, state);
      } else {
        await resumeSinglePlanSession(session, state);
      }
    } catch (error) {
      logger('❌ resumeSession:', error.message);
      throw error;
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  async function goToFloor(floorLevel) {
    logger('Navigating to floor:', floorLevel);
    const state = getState();
    
    const plan = state.buildingPlans.find(p => p.floor_level === floorLevel);
    if (!plan) throw new Error(`No plan found for floor: ${floorLevel}`);
    
    const walkElements = buildWalkElements(
      state.allElements[plan.id] || [],
      state.activeSession.element_type,
      state.activeSession.light_subtype_filter
    );
    
    update(s => ({
      ...s,
      activeSession: { ...s.activeSession, planId: plan.id },
      currentFloor: floorLevel,
      walkElements,
      currentIndex: 0
    }));
  }

  function goToIndex(index) {
    update(s => ({
      ...s,
      currentIndex: Math.max(0, Math.min(index, s.walkElements.length - 1))
    }));
  }

  function goNext() {
    update(s => ({
      ...s,
      currentIndex: Math.min(s.currentIndex + 1, s.walkElements.length - 1)
    }));
  }

  function goPrev() {
    update(s => ({
      ...s,
      currentIndex: Math.max(s.currentIndex - 1, 0)
    }));
  }

  // ── Element Updates ──────────────────────────────────────────────────────

  async function updateElement(elementId, updates) {
    logger('Updating element:', elementId);
    const userId = await getCurrentUserId();
    
    try {
      const updated = await api.update('plan_elements', elementId, {
        ...updates,
        updated_by: userId
      });
      
      update(s => {
        const newAllElements = { ...s.allElements };
        
        // Update in all plan element lists
        for (const pid of Object.keys(newAllElements)) {
          newAllElements[pid] = newAllElements[pid].map(el =>
            el.id === elementId ? { ...el, ...updated } : el
          );
        }
        
        return {
          ...s,
          allElements: newAllElements,
          walkElements: s.walkElements.map(el =>
            el.id === elementId ? { ...el, ...updated } : el
          )
        };
      });
      
      logger('✅ Element updated');
      return updated;
    } catch (error) {
      logger('❌ updateElement:', error.message);
      throw error;
    }
  }

  // ── Inspections ──────────────────────────────────────────────────────────

  async function loadInspectionsMap(sessionId) {
    const rows = await api.get('walk_element_inspections', {
      filters: { walk_session_id: sessionId },
      orderBy: 'inspected_at',
      ascending: true
    });
    
    return rows.reduce((map, row) => {
      if (!map[row.plan_element_id]) map[row.plan_element_id] = [];
      map[row.plan_element_id].push(row);
      return map;
    }, {});
  }

  async function recordInspection({ elementId, result, notes, photoUrl = null }) {
    logger('Recording inspection:', elementId, result);
    const userId = await getCurrentUserId();
    const state = getState();
    
    const element = state.walkElements.find(e => e.id === elementId);
    if (!element) throw new Error('Element not found');
    
    try {
      const inspection = await api.create('walk_element_inspections', {
        walk_session_id: state.activeSession.id,
        plan_element_id: elementId,
        inspection_result: result,
        inspector_notes: notes || null,
        inspected_by: userId,
        inspected_at: new Date().toISOString(),
        photo_url: photoUrl || null
      });
      
      update(s => {
        const newInspections = {
          ...s.inspections,
          [elementId]: [...(s.inspections[elementId] || []), inspection]
        };
        
        // Update floor progress for building-wide sessions
        let newFloorProgress = s.floorProgress;
        if (s.activeSession.session_scope === 'building' && s.currentFloor) {
          const inspectedCount = s.walkElements.filter(el =>
            newInspections[el.id]?.length > 0
          ).length;
          
          newFloorProgress = {
            ...s.floorProgress,
            [s.currentFloor]: {
              ...s.floorProgress[s.currentFloor],
              inspected: inspectedCount
            }
          };
        }
        
        return {
          ...s,
          inspections: newInspections,
          floorProgress: newFloorProgress
        };
      });
      
      logger('✅ Inspection recorded');
      return inspection;
    } catch (error) {
      logger('❌ recordInspection:', error.message);
      throw error;
    }
  }

  async function loadElementInspectionHistory(elementId) {
    logger('Loading inspection history for element:', elementId);
    try {
      return await api.get('walk_element_inspections', {
        select: '*, inspector:profiles!inspected_by(full_name), session:walk_sessions!walk_session_id(session_name, building_name, started_at)',
        filters: { plan_element_id: elementId },
        orderBy: 'inspected_at',
        ascending: false
      });
    } catch (error) {
      logger('❌ loadElementInspectionHistory:', error.message);
      return [];
    }
  }

  async function loadSessionInspections(sessionId) {
    logger('Loading inspections for session:', sessionId);
    try {
      return await api.get('walk_element_inspections', {
        filters: { walk_session_id: sessionId },
        orderBy: 'inspected_at',
        ascending: true
      });
    } catch (error) {
      logger('❌ loadSessionInspections:', error.message);
      throw error;
    }
  }

  // ── Progress & Reports ───────────────────────────────────────────────────

  async function getSessionProgress(sessionId) {
    logger('Getting session progress:', sessionId);
    try {
      const sessions = await api.get('walk_sessions', {
        filters: { id: sessionId }
      });
      
      if (!sessions?.length) throw new Error('Session not found');
      
      const session = sessions[0];
      const total = session.total_elements_count || 0;
      const inspected = session.inspected_elements_count || 0;
      
      return {
        total,
        inspected,
        percentage: total > 0 ? Math.round((inspected / total) * 100) : 0
      };
    } catch (error) {
      logger('❌ getSessionProgress:', error.message);
      throw error;
    }
  }

  async function getFailedElements(buildingName = null) {
    logger('Getting failed elements', buildingName ? `for ${buildingName}` : '');
    try {
      const { data, error } = await supabase
        .from('failed_elements_view')
        .select('*');
      
      if (error) throw error;
      
      return buildingName
        ? data.filter(el => el.building === buildingName)
        : data;
    } catch (error) {
      logger('❌ getFailedElements:', error.message);
      return [];
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  async function deleteSession(sessionId) {
    logger('Deleting session:', sessionId);
    try {
      await api.deleteMany('walk_element_inspections', {
        walk_session_id: sessionId
      });
      await api.delete('walk_sessions', sessionId);
      logger('✅ Session deleted');
    } catch (error) {
      logger('❌ deleteSession:', error.message);
      throw error;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    subscribe,
    // Plans
    loadPlans,
    // Sessions
    loadSessions,
    startSession,
    startBuildingWideSession,
    closeSession,
    resumeSession,
    deleteSession,
    // Navigation
    goToFloor,
    goToIndex,
    goNext,
    goPrev,
    // Elements
    updateElement,
    // Inspections
    recordInspection,
    loadElementInspectionHistory,
    loadSessionInspections,
    // Progress
    getSessionProgress,
    getFailedElements
  };
}

export const walkStore = createWalkStore();
