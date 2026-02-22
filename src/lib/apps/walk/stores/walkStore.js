// src/lib/apps/walk/stores/walkStore.js
// State management for Walk App

import { writable } from 'svelte/store';
import { getLogger } from '$lib/utils/logger';
import { api } from '$lib/utils/api';
import { supabase } from '$lib/supabaseClient';

const logger = getLogger('walkStore');

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user.id;
}

function createWalkStore() {
  const { subscribe, set, update } = writable({
    plans:         [],
    allElements:   {},   // { [planId]: element[] }
    sessions:      [],
    activeSession: null,
    walkElements:  [],
    currentIndex:  0,
    inspections:   {},   // { [elementId]: inspection[] }
    loading:       false,
    error:         null
  });

  // ── Plans ──────────────────────────────────────────────────────────────────

  async function loadPlans() {
    logger('Loading plans…');
    try {
      const plans = await api.get('plans', { orderBy: 'building', ascending: true });
      const allElements = {};
      for (const plan of plans) {
        allElements[plan.id] = await api.get('plan_elements', {
          filters: { plan_id: plan.id }, orderBy: 'asset_id', ascending: true
        });
      }
      update(s => ({ ...s, plans, allElements }));
      logger('✅ Loaded', plans.length, 'plans');
    } catch (error) {
      logger('❌ loadPlans:', error.message);
      throw error;
    }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async function loadSessions() {
    update(s => ({ ...s, loading: true }));
    try {
      const userId   = await getCurrentUserId();
      const sessions = await api.get('walk_sessions', {
        filters: { created_by: userId }, orderBy: 'started_at', ascending: false
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

  // Build the ordered walk list for a session, respecting light emergency filter
  function buildWalkElements(planElements, elementType, lightSubtypeFilter) {
    return planElements
      .filter(el => {
        if (el.element_type !== elementType) return false;
        if (elementType === 'light' && lightSubtypeFilter === 'emergency') {
          return el.emergency === true;
        }
        return true;
      })
      .sort((a, b) => (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true }));
  }

  async function startSession({ building, floorLevel, elementType, startAssetId, planId, sessionName, lightSubtypeFilter }) {
    logger('Starting session:', { building, floorLevel, elementType });
    const userId = await getCurrentUserId();
    try {
      const session = await api.create('walk_sessions', {
        building,
        floor_level:         floorLevel,
        element_type:        elementType,
        start_asset_id:      startAssetId || null,
        session_name:        sessionName  || null,
        light_subtype_filter: lightSubtypeFilter || null,
        status:              'open',
        created_by:          userId,
        updated_by:          userId
      });
      logger('✅ Session created:', session.id);

      let state;
      subscribe(s => { state = s; })();
      const walkElements = buildWalkElements(
        state.allElements[planId] || [],
        elementType,
        lightSubtypeFilter
      );

      let startIndex = 0;
      if (startAssetId) {
        const found = walkElements.findIndex(el => el.asset_id === startAssetId);
        if (found >= 0) startIndex = found;
      }

      try { localStorage.setItem('walk_plan_id', JSON.stringify({ sessionId: session.id, planId })); } catch (_) {}

      update(s => ({
        ...s,
        activeSession: { ...session, planId },
        walkElements,
        currentIndex:  startIndex,
        inspections:   {}
      }));
      return session;
    } catch (error) {
      logger('❌ startSession:', error.message);
      throw error;
    }
  }

  async function closeSession(sessionId, notes = '') {
    logger('Closing session:', sessionId);
    try { localStorage.removeItem('walk_plan_id'); } catch (_) {}
    const userId = await getCurrentUserId();
    try {
      await api.update('walk_sessions', sessionId, {
        status:     'closed',
        closed_at:  new Date().toISOString(),
        notes:      notes || null,
        updated_by: userId
      });
      update(s => ({ ...s, activeSession: null, walkElements: [], currentIndex: 0, inspections: {} }));
      await loadSessions();
      logger('✅ Session closed');
    } catch (error) {
      logger('❌ closeSession:', error.message);
      throw error;
    }
  }

  async function resumeSession(session) {
    logger('Resuming session:', session.id);
    let state;
    subscribe(s => { state = s; })();

    // Try plan_id first, fall back to building+floor match for old sessions
    const plan = session.plan_id
      ? state.plans.find(p => p.id === session.plan_id)
      : (() => {
          // Also check localStorage bridge
          try {
            const stored = JSON.parse(localStorage.getItem('walk_plan_id') || 'null');
            if (stored?.sessionId === session.id) {
              return state.plans.find(p => p.id === stored.planId);
            }
          } catch (_) {}
          return state.plans.find(p =>
            p.building === session.building && String(p.floor_level) === String(session.floor_level)
          );
        })();

    if (!plan) {
      throw new Error(`No plan found for ${session.building} floor ${session.floor_level}`);
    }

    const walkElements = buildWalkElements(
      state.allElements[plan.id] || [],
      session.element_type,
      session.light_subtype_filter
    );

    // Load existing inspections
    const rows = await api.get('element_inspections', {
      filters: { session_id: session.id }, orderBy: 'inspected_at', ascending: true
    });
    const inspections = {};
    for (const row of rows) {
      if (!inspections[row.element_id]) inspections[row.element_id] = [];
      inspections[row.element_id].push(row);
    }

    update(s => ({
      ...s,
      activeSession: { ...session, planId: plan.id },
      walkElements,
      currentIndex:  0,
      inspections
    }));
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goToIndex(index) {
    update(s => ({ ...s, currentIndex: Math.max(0, Math.min(index, s.walkElements.length - 1)) }));
  }
  function goNext() {
    update(s => ({ ...s, currentIndex: Math.min(s.currentIndex + 1, s.walkElements.length - 1) }));
  }
  function goPrev() {
    update(s => ({ ...s, currentIndex: Math.max(s.currentIndex - 1, 0) }));
  }

  // ── Element editing ────────────────────────────────────────────────────────

  async function updateElement(elementId, updates) {
    const userId = await getCurrentUserId();
    try {
      const updated = await api.update('plan_elements', elementId, { ...updates, updated_by: userId });
      update(s => {
        const newAll = { ...s.allElements };
        for (const pid of Object.keys(newAll)) {
          newAll[pid] = newAll[pid].map(el => el.id === elementId ? { ...el, ...updated } : el);
        }
        return {
          ...s,
          allElements:  newAll,
          walkElements: s.walkElements.map(el => el.id === elementId ? { ...el, ...updated } : el)
        };
      });
      return updated;
    } catch (error) {
      logger('❌ updateElement:', error.message);
      throw error;
    }
  }

  // ── Inspections ────────────────────────────────────────────────────────────

  async function addInspection({ sessionId, elementId, result, notes, element }) {
    const userId = await getCurrentUserId();
    try {
      const inspection = await api.create('element_inspections', {
        session_id:     sessionId,
        element_id:     elementId,
        result,
        notes:          notes || null,
        inspector_id:   userId,
        inspected_at:   new Date().toISOString(),
        element_type:   element.element_type,
        asset_id:       element.asset_id,
        subtype:        element.subtype,
        status_at_time: element.status
      });
      update(s => {
        const existing = s.inspections[elementId] || [];
        return { ...s, inspections: { ...s.inspections, [elementId]: [...existing, inspection] } };
      });
      logger('✅ Inspection recorded');
      return inspection;
    } catch (error) {
      logger('❌ addInspection:', error.message);
      throw error;
    }
  }

  async function loadElementInspectionHistory(elementId) {
    try {
      return await api.get('element_inspections', {
        select:  '*, inspector:profiles!inspector_id(full_name), session:walk_sessions!session_id(building, floor_level, started_at)',
        filters: { element_id: elementId },
        orderBy: 'inspected_at', ascending: false
      });
    } catch (error) {
      logger('❌ loadElementInspectionHistory:', error.message);
      return [];
    }
  }

  async function loadSessionInspections(sessionId) {
    try {
      return await api.get('element_inspections', {
        filters: { session_id: sessionId }, orderBy: 'inspected_at', ascending: true
      });
    } catch (error) {
      logger('❌ loadSessionInspections:', error.message);
      throw error;
    }
  }

  return {
    subscribe,
    loadPlans,
    loadSessions,
    startSession,
    closeSession,
    resumeSession,
    goToIndex,
    goNext,
    goPrev,
    updateElement,
    addInspection,
    loadElementInspectionHistory,
    loadSessionInspections
  };
}

export const walkStore = createWalkStore();
