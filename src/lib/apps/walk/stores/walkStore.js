// src/lib/apps/walk/stores/walkStore.js
// State management for Walk App — inspection sessions and element walk-throughs

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
    // Plans data (loaded once on mount)
    plans:           [],
    allElements:     {},    // { [planId]: element[] }

    // Session state
    sessions:        [],    // recent walk sessions
    activeSession:   null,  // the open session object

    // Walk state (set when a session is active)
    walkElements:    [],    // sorted elements for this session's type+plan
    currentIndex:    0,     // which element in walkElements we're viewing
    inspections:     {},    // { [elementId]: inspection[] } — this session's inspections

    loading:         false,
    error:           null
  });

  // ── Plans data ─────────────────────────────────────────────────────────────

  async function loadPlans() {
    logger('Loading plans for walk app...');
    try {
      const plans = await api.get('plans', {
        orderBy: 'building',
        ascending: true
      });
      const allElements = {};
      for (const plan of plans) {
        const elements = await api.get('plan_elements', {
          filters: { plan_id: plan.id },
          orderBy: 'asset_id',
          ascending: true
        });
        allElements[plan.id] = elements;
      }
      update(s => ({ ...s, plans, allElements }));
      logger('✅ Loaded', plans.length, 'plans');
      return { plans, allElements };
    } catch (error) {
      logger('❌ loadPlans:', error.message);
      throw error;
    }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async function loadSessions() {
    logger('Loading walk sessions...');
    update(s => ({ ...s, loading: true }));
    try {
      const userId = await getCurrentUserId();
      const sessions = await api.get('walk_sessions', {
        filters:   { created_by: userId },
        orderBy:   'started_at',
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

  async function startSession({ building, floorLevel, elementType, startAssetId, planId }) {
    logger('Starting session:', { building, floorLevel, elementType, startAssetId });
    const userId = await getCurrentUserId();
    try {
      const session = await api.create('walk_sessions', {
        // plan_id stored after walk-plan-id-migration.sql is run
        building,
        floor_level:    floorLevel,
        element_type:   elementType,
        start_asset_id: startAssetId || null,
        status:         'open',
        created_by:     userId,
        updated_by:     userId
      });
      logger('✅ Session created:', session.id);

      // Build the ordered walk list for this session
      // Get state from store synchronously
      let state;
      subscribe(s => { state = s; })();
      const planElements = state.allElements[planId] || [];
      const walkElements = planElements
        .filter(el => el.element_type === elementType)
        .sort((a, b) => (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true }));

      // Find start index
      let startIndex = 0;
      if (startAssetId) {
        const found = walkElements.findIndex(el => el.asset_id === startAssetId);
        if (found >= 0) startIndex = found;
      }

      // Persist planId across page refreshes (no DB column needed yet)
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
      update(s => ({
        ...s,
        activeSession: null,
        walkElements:  [],
        currentIndex:  0,
        inspections:   {}
      }));
      await loadSessions();
      logger('✅ Session closed');
    } catch (error) {
      logger('❌ closeSession:', error.message);
      throw error;
    }
  }

  // Resume an existing open session
  async function resumeSession(session) {
    logger('Resuming session:', session.id);
    let state;
    subscribe(s => { state = s; })();

    // Prefer direct plan_id lookup (set on sessions created after this fix).
    // Fall back to building+floor_level match for older sessions.
    const plan = session.plan_id
      ? state.plans.find(p => p.id === session.plan_id)
      : state.plans.find(p => p.building === session.building && p.floor_level === session.floor_level);

    if (!plan) {
      logger('❌ No plan found for session — plan_id:', session.plan_id,
             'building:', session.building, 'floor:', session.floor_level);
      throw new Error(
        session.plan_id
          ? `Plan no longer exists (id: ${session.plan_id})`
          : `No plan found for ${session.building} floor ${session.floor_level}`
      );
    }

    const planElements = state.allElements[plan.id] || [];
    const walkElements = planElements
      .filter(el => el.element_type === session.element_type)
      .sort((a, b) => (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true }));

    // Load existing inspections for this session
    const inspectionRows = await api.get('element_inspections', {
      filters: { session_id: session.id },
      orderBy: 'inspected_at',
      ascending: true
    });
    const inspections = {};
    for (const row of inspectionRows) {
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

  // ── Walk navigation ────────────────────────────────────────────────────────

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

  // ── Element editing ────────────────────────────────────────────────────────

  async function updateElement(elementId, updates) {
    logger('Updating element:', elementId);
    const userId = await getCurrentUserId();
    try {
      const updated = await api.update('plan_elements', elementId, {
        ...updates,
        updated_by: userId
      });
      // Update in allElements and walkElements
      update(s => {
        const newAllElements = { ...s.allElements };
        for (const planId of Object.keys(newAllElements)) {
          newAllElements[planId] = newAllElements[planId].map(
            el => el.id === elementId ? { ...el, ...updated } : el
          );
        }
        const newWalkElements = s.walkElements.map(
          el => el.id === elementId ? { ...el, ...updated } : el
        );
        return { ...s, allElements: newAllElements, walkElements: newWalkElements };
      });
      logger('✅ Element updated');
      return updated;
    } catch (error) {
      logger('❌ updateElement:', error.message);
      throw error;
    }
  }

  // ── Inspections ────────────────────────────────────────────────────────────

  async function addInspection({ sessionId, elementId, planId, result, notes, element }) {
    logger('Adding inspection for element:', elementId, 'result:', result);
    const userId = await getCurrentUserId();
    try {
      const inspection = await api.create('element_inspections', {
        session_id:     sessionId,
        element_id:     elementId,
        // plan_id stored after walk-plan-id-migration.sql is run
        result,
        notes:          notes || null,
        inspector_id:   userId,
        inspected_at:   new Date().toISOString(),
        // Snapshot
        element_type:   element.element_type,
        asset_id:       element.asset_id,
        subtype:        element.subtype,
        status_at_time: element.status
      });
      update(s => {
        const existing = s.inspections[elementId] || [];
        return {
          ...s,
          inspections: {
            ...s.inspections,
            [elementId]: [...existing, inspection]
          }
        };
      });
      logger('✅ Inspection recorded');
      return inspection;
    } catch (error) {
      logger('❌ addInspection:', error.message);
      throw error;
    }
  }

  async function loadElementInspectionHistory(elementId) {
    logger('Loading inspection history for element:', elementId);
    try {
      const rows = await api.get('element_inspections', {
        select:    '*, inspector:profiles!inspector_id(full_name), session:walk_sessions!session_id(building, floor_level, started_at)',
        filters:   { element_id: elementId },
        orderBy:   'inspected_at',
        ascending: false
      });
      logger('✅ Loaded', rows.length, 'inspections');
      return rows;
    } catch (error) {
      logger('❌ loadElementInspectionHistory:', error.message);
      return [];
    }
  }

  // Load all inspections for a completed session (for summary view)
  async function loadSessionInspections(sessionId) {
    logger('Loading inspections for session:', sessionId);
    try {
      const rows = await api.get('element_inspections', {
        filters:   { session_id: sessionId },
        orderBy:   'inspected_at',
        ascending: true
      });
      logger('✅ Loaded', rows.length, 'inspections');
      return rows;
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
