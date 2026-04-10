// src/lib/apps/v2plan/stores/v2planStore.js
// Read-only store for the V2 Plan viewer app.
// Loads building, floors, type hierarchy, plans, components, spaces and
// inspections. Caches everything in localStorage for offline fallback.
//
// No create / update / delete methods — this app is view-only.

import { writable, get } from 'svelte/store';
import { api }           from '$lib/utils/api';
import { getLogger }     from '$lib/utils/logger';
import { resolveHierarchy } from '$lib/apps/v2/utils/attrResolution.js';

const logger = getLogger('v2planStore');

// ── Cache config ──────────────────────────────────────────────────────────────

// Bump CACHE_VERSION whenever the shape of cached data changes (forces fresh fetch).
const CACHE_VERSION         = 3;
const CACHE_KEY_HIERARCHY   = `v2plan_cache_hierarchy_v${CACHE_VERSION}`;
const CACHE_KEY_FLOOR       = id => `v2plan_cache_floor_${id}_v${CACHE_VERSION}`;
const CACHE_KEY_FILTER      = 'v2plan_filter';
const CACHE_KEY_LAST_FLOOR  = 'v2plan_last_floor_id';
const TTL_HIERARCHY_MS    = 24 * 60 * 60 * 1000;   // 24 h
const TTL_FLOOR_MS        =  1 * 60 * 60 * 1000;   //  1 h
const FETCH_TIMEOUT_MS    = 8000;

// ── Initial state ─────────────────────────────────────────────────────────────

const INITIAL = {
  // Static — loaded once
  building:       null,
  floors:         [],
  systems:        [],
  types:          [],
  attrDefs:       {},   // { [typeId]: resolved attr defs[] }
  plans:          [],

  // Per-floor
  currentFloor:   null,
  currentPlan:    null,
  components:     [],
  spaces:         [],
  annotations:    [],   // plan_annotations[] for the current plan
  inspections:    {},   // { [componentId]: latest inspection row }

  // On-demand (lazy, cached per session)
  componentAttrs: {},   // { [componentId]: component_attributes[] }

  // Filter (persisted to localStorage)
  hiddenTypes:    new Set(),
  hiddenStatuses: new Set(),
  showSpaces:     true,

  // Offline
  usingCache:     false,
  cachedAt:       null,

  // UI
  loading:        false,
  loadingFloor:   false,
  error:          null,
};

const { subscribe, update, set } = writable({ ...INITIAL, hiddenTypes: new Set(), hiddenStatuses: new Set() });

// ── Cache helpers ─────────────────────────────────────────────────────────────

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    logger('⚠️ Cache write failed:', e.message);
  }
}

function readCache(key, ttlMs = Infinity) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    const age = Date.now() - ts;
    return { data, expired: age > ttlMs, ageMs: age };
  } catch {
    return null;
  }
}

function ageLabel(ms) {
  if (ms < 60_000)    return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

// ── Network with timeout ──────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    )
  ]);
}

// ── Load type hierarchy (building / floors / types / plans) ───────────────────

async function fetchHierarchy() {
  const [facilitiesRes, floorsRes, systemsRes, typesRes, defsRes, plansRes] =
    await Promise.all([
      withTimeout(api.get('facilities'),                                                                    FETCH_TIMEOUT_MS),
      withTimeout(api.get('floors',           { orderBy: 'level_order' }),                                 FETCH_TIMEOUT_MS),
      withTimeout(api.get('building_systems', { orderBy: 'presentation_order' }),                          FETCH_TIMEOUT_MS),
      withTimeout(api.get('component_types',  { orderBy: 'presentation_order' }),                          FETCH_TIMEOUT_MS),
      withTimeout(api.get('type_attributes',  { orderBy: 'presentation_order' }),                          FETCH_TIMEOUT_MS),
      withTimeout(api.get('plans',            { select: 'id,floor_id,image_url,image_aspect_ratio,floor_level,scale_ref', orderBy: 'floor_level' }), FETCH_TIMEOUT_MS),
    ]);

  const { attrDefs } = resolveHierarchy(systemsRes, typesRes, defsRes);

  return {
    building: facilitiesRes[0] ?? null,
    floors:   floorsRes,
    systems:  systemsRes,
    types:    typesRes,
    attrDefs,
    plans:    plansRes,
  };
}

// ── Public store methods ──────────────────────────────────────────────────────

async function load() {
  update(s => ({ ...s, loading: true, error: null }));

  // Restore saved filter
  try {
    const saved = localStorage.getItem(CACHE_KEY_FILTER);
    if (saved) {
      const { hiddenTypes = [], hiddenStatuses = [], showSpaces = true } = JSON.parse(saved);
      update(s => ({
        ...s,
        hiddenTypes:    new Set(hiddenTypes),
        hiddenStatuses: new Set(hiddenStatuses),
        showSpaces,
      }));
    }
  } catch { /* ignore */ }

  let hierarchyData = null;
  let usingCache    = false;
  let cachedAt      = null;

  try {
    hierarchyData = await fetchHierarchy();
    writeCache(CACHE_KEY_HIERARCHY, hierarchyData);
  } catch (err) {
    logger('⚠️ Hierarchy fetch failed, trying cache:', err.message);
    const cached = readCache(CACHE_KEY_HIERARCHY, TTL_HIERARCHY_MS * 10); // accept any age
    if (cached) {
      hierarchyData = cached.data;
      usingCache    = true;
      cachedAt      = new Date(Date.now() - cached.ageMs);
    }
  }

  if (!hierarchyData) {
    update(s => ({ ...s, loading: false, error: 'No data available offline. Connect to the internet and try again.' }));
    return;
  }

  update(s => ({
    ...s,
    ...hierarchyData,
    loading:    false,
    usingCache,
    cachedAt,
  }));

  // Restore last-viewed floor, falling back to the first floor
  if (hierarchyData.floors.length > 0) {
    const lastFloorId = localStorage.getItem(CACHE_KEY_LAST_FLOOR);
    const target = lastFloorId && hierarchyData.floors.find(f => f.id === lastFloorId)
      ? lastFloorId
      : hierarchyData.floors[0].id;
    await selectFloor(target, false);
  }
}

async function selectFloor(floorId, forceRefresh = false) {
  const state = get({ subscribe });
  const floor = state.floors.find(f => f.id === floorId);
  if (!floor) return;

  // Find matching plan
  const plan = state.plans.find(p => p.floor_id === floorId) ?? null;

  // Persist so the next session opens the same floor
  try { localStorage.setItem(CACHE_KEY_LAST_FLOOR, floorId); } catch { /* ignore */ }

  update(s => ({
    ...s,
    currentFloor:  floor,
    currentPlan:   plan,
    components:    [],
    spaces:        [],
    annotations:   [],
    inspections:   {},
    loadingFloor:  true,
    error:         null,
  }));

  let floorData   = null;
  let usingCache  = false;
  let cachedAt    = null;

  if (!forceRefresh) {
    const cached = readCache(CACHE_KEY_FLOOR(floorId), TTL_FLOOR_MS);
    if (cached && !cached.expired) {
      floorData  = cached.data;
      usingCache = true;
      cachedAt   = new Date(Date.now() - cached.ageMs);
    }
  }

  if (!floorData) {
    try {
      floorData = await fetchFloorForPlan(plan?.id, floorId);
      writeCache(CACHE_KEY_FLOOR(floorId), floorData);
    } catch (err) {
      logger('⚠️ Floor fetch failed, trying cache:', err.message);
      const cached = readCache(CACHE_KEY_FLOOR(floorId), Infinity);
      if (cached) {
        floorData  = cached.data;
        usingCache = true;
        cachedAt   = new Date(Date.now() - cached.ageMs);
      }
    }
  }

  if (!floorData) {
    update(s => ({
      ...s,
      loadingFloor: false,
      error: `Could not load floor data for ${floor.name}.`,
    }));
    return;
  }

  update(s => ({
    ...s,
    components:   floorData.components,
    spaces:       floorData.spaces,
    annotations:  floorData.annotations,
    inspections:  floorData.inspections,
    loadingFloor: false,
    usingCache,
    cachedAt,
  }));
}

async function fetchFloorForPlan(planId, floorId) {
  // Step 1: fetch components, spaces, and annotations in parallel
  const [components, spaces, annotations] = await Promise.all([
    withTimeout(
      api.get('components', {
        select: 'id,asset_id,label,notes,status,type_code,plan_id,x_position,y_position,floor_id,linked_component_ref',
        filters: { floor_id: floorId },
        orderBy: 'asset_id',
      }),
      FETCH_TIMEOUT_MS
    ),
    planId
      ? withTimeout(
          api.get('spaces', {
            select: 'id,name,colour,polygon,show_label,plan_id',
            filters: { plan_id: planId },
          }),
          FETCH_TIMEOUT_MS
        ).catch(() => [])
      : Promise.resolve([]),
    planId
      ? withTimeout(
          api.get('plan_annotations', {
            select: 'id,text,x_position,y_position,font_size,colour,bold,plan_id',
            filters: { plan_id: planId },
          }),
          FETCH_TIMEOUT_MS
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Step 2: fetch inspections only if there are components on this floor.
  // Load all inspections and filter client-side — api.js doesn't support .in() queries.
  // component_inspections is typically small; we build a Set for the floor's IDs.
  const floorCompIds = new Set(components.map(c => c.id));
  let rawInspections = [];

  if (floorCompIds.size > 0) {
    rawInspections = await withTimeout(
      api.get('component_inspections', {
        select: 'id,component_id,inspection_result,inspector_notes,inspected_at',
        orderBy: 'inspected_at',
        ascending: false,
      }),
      FETCH_TIMEOUT_MS
    ).catch(() => []);
  }

  // Build latest-inspection map, keeping only this floor's components
  const inspections = {};
  for (const insp of rawInspections) {
    if (floorCompIds.has(insp.component_id) && !inspections[insp.component_id]) {
      inspections[insp.component_id] = insp;
    }
  }

  return { components, spaces: spaces ?? [], annotations: annotations ?? [], inspections };
}

async function loadComponentAttrs(componentId) {
  const state = get({ subscribe });
  if (state.componentAttrs[componentId]) return; // already cached for this session

  try {
    const rows = await api.get('component_attributes', {
      select: 'id,component_id,type_attribute_id,value',
      filters: { component_id: componentId },
    });

    // Enrich from the already-loaded attrDefs (flat map of all defs by id).
    // Build id→def lookup once from attrDefs (which is indexed by typeId).
    const allDefs = Object.values(state.attrDefs).flat();
    const defById = {};
    for (const d of allDefs) defById[d.id] = d;

    const attrs = rows.map(r => {
      const def = defById[r.type_attribute_id];
      return {
        ...r,
        attr_name:    def?.name         ?? '',
        display_type: def?.display_type ?? 'text',
      };
    });

    update(s => ({
      ...s,
      componentAttrs: { ...s.componentAttrs, [componentId]: attrs },
    }));
  } catch (err) {
    logger('⚠️ loadComponentAttrs failed:', err.message);
  }
}

async function prefetchFloor(floorId) {
  const cached = readCache(CACHE_KEY_FLOOR(floorId), TTL_FLOOR_MS);
  if (cached && !cached.expired) return; // already fresh

  const state = get({ subscribe });
  const plan  = state.plans.find(p => p.floor_id === floorId) ?? null;
  try {
    const floorData = await fetchFloorForPlan(plan?.id, floorId);
    writeCache(CACHE_KEY_FLOOR(floorId), floorData);
  } catch {
    // background prefetch — silently ignore failures
  }
}

function setFilter({ hiddenTypes, hiddenStatuses, showSpaces }) {
  update(s => {
    const next = {
      ...s,
      hiddenTypes:    hiddenTypes    ?? s.hiddenTypes,
      hiddenStatuses: hiddenStatuses ?? s.hiddenStatuses,
      showSpaces:     showSpaces     ?? s.showSpaces,
    };
    try {
      localStorage.setItem(CACHE_KEY_FILTER, JSON.stringify({
        hiddenTypes:    [...next.hiddenTypes],
        hiddenStatuses: [...next.hiddenStatuses],
        showSpaces:     next.showSpaces,
      }));
    } catch { /* ignore */ }
    return next;
  });
}

function clearFilter() {
  setFilter({ hiddenTypes: new Set(), hiddenStatuses: new Set(), showSpaces: true });
}

async function refresh() {
  const state = get({ subscribe });
  update(s => ({ ...s, usingCache: false, cachedAt: null }));
  await load();
  if (state.currentFloor) {
    await selectFloor(state.currentFloor.id, true);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export const v2planStore = {
  subscribe,
  load,
  selectFloor,
  loadComponentAttrs,
  prefetchFloor,
  setFilter,
  clearFilter,
  refresh,
  ageLabel,
};
