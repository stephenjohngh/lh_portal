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
  inspectionResultPatch,
  updateComponent          as writeComponent,
  replaceComponentAttributes,
} from '$lib/apps/building_assets/public.js';
import { newUuid }                 from '$lib/utils/uuid.js';
import { resolveHierarchy }        from '$lib/utils/attrResolution.js';
import { sortByResultFloorAsset }  from '$lib/utils/componentSorting.js';
import { normalisePhotoUrl } from '$lib/utils/driveUtils.js';
// Polymorphic photo storage (media_attachments) goes through the shared module,
// not raw supabase queries.
// mergePhotosIntoRows batch-reads photos; the write side (add/purge) now lives in
// the offline syncer (inspectionSyncDeps.js).
import { listAttachments } from '$lib/utils/mediaAttachments.js';
import { deleteWalkSession, lastDefinitionInspections } from '../public.js';   // session-delete cascade + rotation inputs (shared)
// Offline read cache (IndexedDB) — lets a walk start when the network is down.
// Network-first: a successful fetch always refreshes the cache; the cache is only
// read as a fallback. See docs/requirements/Inspection_Offline_Walk_Design.md.
import { openQueue, isOfflineAvailable, readCache, writeCache, enqueueInspectionSave, putPhoto } from '../utils/offlineQueue.js';
import { syncOne }      from '../utils/inspectionSync.js';
import { makeSyncDeps } from '../utils/inspectionSyncDeps.js';
import { kickSync, flush as flushQueue } from '../utils/syncRunner.js';
import { statusBeforeSession } from '../utils/inspectionHelpers.js';
import {
  makeWalkBuilder,
  firstNonEmptyFloor,
  initFloorProgress,
  calcFloorProgress,
} from '../utils/inspectionWalk.js';
import { buildRotatingWalk, resolveLinkedSet } from '../utils/inspectionRotation.js';

const logger = getLogger('inspectionStore');

// ── Offline read cache ────────────────────────────────────────────────────────
// Bump CACHE_VERSION when the cached payload shape changes (forces a fresh fetch
// rather than restoring a stale shape). Keys are versioned so an old cache is
// simply never read.
const CACHE_VERSION      = 1;
const CACHE_KEY_LOAD     = `load_v${CACHE_VERSION}`;         // the hierarchy+components build
const CACHE_KEY_DEFS     = `definitions_v${CACHE_VERSION}`;  // definitions + scheduleSessions
const CACHE_KEY_SESSIONS = `sessions_v${CACHE_VERSION}`;     // this user's walk_sessions list

async function cacheGet(key) {
  if (!isOfflineAvailable()) return null;
  try { return await readCache(await openQueue(), key); }
  catch (e) { logger('⚠ cache read failed:', e.message); return null; }
}
async function cachePut(key, data) {
  if (!isOfflineAvailable()) return;
  try { await writeCache(await openQueue(), key, data); }
  catch (e) { logger('⚠ cache write failed:', e.message); }
}

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
  componentLinks:   {},      // { [fromComponentId]: component_links[] } — rotating linked sets

  // Configurable inspection definitions (admin-maintained config) + the closed
  // sessions that drive their due/overdue state (computeInspectionSchedule).
  definitions:      [],      // inspection_definitions rows
  scheduleSessions: [],      // closed walk_sessions (lite rows: id, definition_id, status, closed_at)
  latestInspections: {},     // { componentId: latest component_inspections row } — lazy, for
                             // definition scopes with condition-attribute filters

  // Session state
  sessions:         [],
  activeSession:    null,
  walkComponents:   [],      // components in current walk scope (filtered + ordered)
  currentIndex:     0,
  inspections:      {},      // { componentId: inspection } — latest per component for this session
  statusBefore:     {},      // { componentId: status } — status before THIS session changed it
  buildingFloors:   [],      // ordered floor objects for building-wide sessions
  currentFloor:     null,    // active floor object (building-wide)
  floorProgress:    {},      // { floorId: { inspected, total } }

  // Offline read cache signalling (P1). usingCache = data came from the IndexedDB
  // fallback, not a fresh fetch; cachedAt = when that cache was written.
  usingCache:       false,
  cachedAt:         null,

  loading:          false,
  error:            null,
};

const RESET_SESSION_STATE = {
  activeSession:  null,
  walkComponents: [],
  currentIndex:   0,
  inspections:    {},
  statusBefore:   {},
  buildingFloors: [],
  currentFloor:   null,
  floorProgress:  {},
};

// -- Auth helpers --------------------------------------------------------------

async function getCurrentUserId() {
  // getSession() reads the locally-stored session (no network), so it still
  // yields the user id when offline — unlike getUser(), which round-trips to the
  // auth server. Fall back to getUser() only if the local session is absent.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;
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

  // Fetch the whole hierarchy + component dataset and build the derived indexes
  // (attrDefs, allComponents, allComponentAttrs, componentLinks). Returns the
  // ready-to-spread state slice — the same object we cache for offline use, so a
  // cache restore needs no re-deriving.
  async function fetchHierarchyBuilt() {
    const [facilities, floors, systems, types, defs, options, plans, components, componentAttrs, links] =
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
        // Rotating definitions resolve their linked set from component_links.
        api.getAll('component_links').catch(() => []),
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

    // Index component_links by from_component_id
    const componentLinks = {};
    for (const link of links) {
      (componentLinks[link.from_component_id] ??= []).push(link);
    }

    return { facilities, floors, systems, types, attrDefs, attrOptions,
             plans, allComponents, allComponentAttrs, componentLinks };
  }

  async function load() {
    logger('Loading inspection data…');
    update(s => ({ ...s, loading: true, error: null }));

    // Hierarchy — network-first, fall back to the offline cache. A successful
    // fetch always refreshes the cache; the cache is a fallback, never preferred.
    let built = null, usingCache = false, cachedAt = null;
    try {
      built = await fetchHierarchyBuilt();
      void cachePut(CACHE_KEY_LOAD, built);
    } catch (err) {
      logger('⚠ hierarchy fetch failed, trying offline cache:', err.message);
      const cached = await cacheGet(CACHE_KEY_LOAD);
      if (cached) {
        built = cached.data; usingCache = true; cachedAt = new Date(cached.ts);
        logger('📦 using cached inspection data from', cachedAt.toISOString());
      } else {
        // No network AND no cache — surface the real failure (the OFFLINE pill
        // conveys connectivity; masking a genuine server error would mislead).
        logger('❌ load: fetch failed and no offline cache available');
        update(s => ({ ...s, loading: false, error: err.message }));
        throw err;
      }
    }

    update(s => ({ ...s, ...built, usingCache, cachedAt, loading: false }));
    logger('✅ inspection data loaded:',
      'floors:', built.floors.length,
      '| types:', built.types.length,
      '| components:', Object.values(built.allComponents).flat().length,
      usingCache ? '(from cache)' : '',
    );

    // Inspection definitions + their schedule inputs — non-fatal, so the app
    // still works (ad-hoc + repair) if the definitions table is unavailable.
    // Closed sessions come newest-first: only the most recent closed session per
    // definition matters for the schedule, so the 1000-row page is plenty.
    try {
      const [definitions, scheduleSessions] = await Promise.all([
        api.get('inspection_definitions', { orderBy: 'presentation_order' }),
        api.get('walk_sessions', {
          // counts drive completeness in computeInspectionSchedule (a finished-early
          // session must not reset the clock).
          select:    'id, definition_id, status, closed_at, inspected_components_count, total_components_count',
          filters:   { status: 'closed' },
          orderBy:   'closed_at',
          ascending: false,
        }),
      ]);
      update(s => ({ ...s, definitions, scheduleSessions }));
      void cachePut(CACHE_KEY_DEFS, { definitions, scheduleSessions });
      logger('✅ definitions loaded:', definitions.length);
    } catch (err) {
      logger('⚠ definitions load (non-fatal), trying cache:', err.message);
      const cached = await cacheGet(CACHE_KEY_DEFS);
      if (cached) update(s => ({ ...s, definitions: cached.data.definitions ?? [], scheduleSessions: cached.data.scheduleSessions ?? [] }));
    }
  }

  // -- Walk building -------------------------------------------------------------

  // ctx consumed by the shared scope filter engine (see inspectionWalk.js).
  function walkCtx(state) {
    return {
      types:          state.types,
      attrDefs:       state.attrDefs,
      componentAttrs: state.allComponentAttrs ?? {},
      inspections:    state.latestInspections ?? {},
    };
  }

  // Condition-attribute scope filters match against each component's LATEST
  // inspection — load that map once, on demand (definition sessions only).
  let latestInspectionsLoaded = false;
  async function ensureLatestInspections() {
    if (latestInspectionsLoaded) return;
    const state = getState();
    const ids = Object.values(state.allComponents).flat().map(c => c.id);
    try {
      const rows = await api.latestInspections(ids);
      const map = {};
      for (const r of rows ?? []) map[r.component_id] = r;
      latestInspectionsLoaded = true;
      update(s => ({ ...s, latestInspections: map }));
    } catch (err) {
      logger('⚠ latestInspections load:', err.message);
    }
  }

  // Resolve a session's walk config ({ definition } or { typeFilter, emergencyOnly })
  // into a buildFn, loading the latest-inspections map first when the scope
  // filters on condition attributes.
  async function prepareWalkBuilder(walk) {
    if (walk.definition?.scope?.conditionAttrFilters?.length) {
      await ensureLatestInspections();
    }
    return makeWalkBuilder(walk, walkCtx(getState()));
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
      void cachePut(CACHE_KEY_SESSIONS, sessions);
      return sessions;
    } catch (err) {
      // Offline — fall back to the last cached session list so the Home screen
      // (and Resume) still work. Offline-created sessions are folded in by the
      // outbox in a later phase (P4).
      const cached = await cacheGet(CACHE_KEY_SESSIONS);
      if (cached) {
        logger('📦 using cached sessions list');
        update(s => ({ ...s, sessions: cached.data, loading: false, usingCache: true }));
        return cached.data;
      }
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

  // `definition` (an inspection_definitions row) supersedes typeFilter +
  // emergencyOnly when present: the walk is the definition's scope, and the
  // session is stamped with definition_id so the read-time schedule can key
  // off its closed sessions.
  async function startSession({ building, floor, typeFilter, emergencyOnly, sessionName, sessionType, preset, targetComponentId, definition }) {
    logger('startSession:', { building, floor: floor?.short_name, typeFilter, targetComponentId, definition: definition?.name });
    const walk    = definition ? { definition } : { typeFilter, emergencyOnly };
    const buildFn = await prepareWalkBuilder(walk);
    const state   = getState();
    const floorComponents = state.allComponents[floor.id] ?? [];
    let walkComponents = buildFn(floorComponents);
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
      session_preset:            definition ? 'custom' : preset,
      // Definition sessions record the RESOLVED type codes for the historic
      // record; scheduling keys off definition_id (plan §4.2).
      type_filter:               JSON.stringify(definition ? [...new Set(walkComponents.map(c => c.type_code))] : typeFilter),
      emergency_only:            definition ? false : emergencyOnly,
      definition_id:             definition?.id ?? null,
      building,
      floor_id:                  floor.id,
      session_name:              sessionName,
      total_components_count:    walkComponents.length,
      inspected_components_count: 0,
    });

    update(s => ({
      ...s,
      activeSession:  { ...session, _floorObj: floor, _walk: walk },
      walkComponents,
      currentIndex:   0,
      inspections:    {},
      statusBefore:   {},
      buildingFloors: [],
      currentFloor:   floor,
      floorProgress:  {},
    }));

    return session;
  }

  // -- Start building-wide session ----------------------------------------------

  async function startBuildingWideSession({ building, typeFilter, emergencyOnly, sessionName, sessionType, preset, definition }) {
    logger('startBuildingWideSession:', { building, typeFilter, definition: definition?.name });
    const walk    = definition ? { definition } : { typeFilter, emergencyOnly };
    const buildFn = await prepareWalkBuilder(walk);
    const state   = getState();

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

    const allWalkComponents = buildingFloors.flatMap(floor => buildFn(state.allComponents[floor.id] ?? []));

    const session = await createSession({
      session_type:              sessionType,
      session_scope:             'building',
      session_preset:            definition ? 'custom' : preset,
      type_filter:               JSON.stringify(definition ? [...new Set(allWalkComponents.map(c => c.type_code))] : typeFilter),
      emergency_only:            definition ? false : emergencyOnly,
      definition_id:             definition?.id ?? null,
      building,
      floor_id:                  null,
      session_name:              sessionName,
      total_components_count:    allWalkComponents.length,
      inspected_components_count: 0,
    });

    const floorProgress = initFloorProgress(buildingFloors, state.allComponents, buildFn);
    // Start on the first floor that actually has matching components
    const firstResult   = firstNonEmptyFloor(buildingFloors, state.allComponents, buildFn, 0, 1);
    const firstFloor    = firstResult?.floor    ?? buildingFloors[0];
    const walkComponents = firstResult?.components ?? [];

    update(s => ({
      ...s,
      activeSession:  { ...session, _walk: walk },
      buildingFloors,
      currentFloor:   firstFloor,
      floorProgress,
      walkComponents,
      currentIndex:   0,
      inspections:    {},
      statusBefore:   {},
    }));

    return session;
  }

  // -- Start rotating (trigger-based) session -------------------------------------

  // A rotating definition's session exercises ONE trigger (the least recently
  // tested pool member) plus its linked components — a flat pinned list, no
  // floor navigation. The trigger is stamped on the session
  // (trigger_component_id, migration 154) so resume never re-derives it.
  async function startRotatingSession({ building, definition, sessionName, sessionType }) {
    logger('startRotatingSession:', { building, definition: definition?.name });
    if (definition.scope?.conditionAttrFilters?.length) await ensureLatestInspections();
    const lastTested = await lastDefinitionInspections(definition.id);
    const state      = getState();
    const allComps   = Object.values(state.allComponents).flat();

    const { trigger, linked, unresolved, walkComponents } = buildRotatingWalk(definition, {
      components:     allComps,
      floors:         state.floors,
      componentLinks: state.componentLinks,
      ctx:            walkCtx(state),
      lastTested,
    });
    if (!trigger) throw new Error('No trigger component matches this inspection’s scope.');
    if (unresolved.length > 0) logger('⚠ unresolved link refs:', unresolved.join(', '));

    const floor = state.floors.find(f => f.id === trigger.floor_id) ?? null;

    const session = await createSession({
      session_type:              sessionType,
      session_scope:             'single_floor',
      session_preset:            'custom',
      type_filter:               JSON.stringify([...new Set(walkComponents.map(c => c.type_code))]),
      emergency_only:            false,
      definition_id:             definition.id,
      trigger_component_id:      trigger.id,
      building,
      floor_id:                  trigger.floor_id ?? null,
      session_name:              sessionName,
      total_components_count:    walkComponents.length,
      inspected_components_count: 0,
    });

    update(s => ({
      ...s,
      activeSession:  { ...session, _floorObj: floor, _walk: { definition } },
      walkComponents,
      currentIndex:   0,
      inspections:    {},
      statusBefore:   {},
      buildingFloors: [],
      currentFloor:   floor,
      floorProgress:  {},
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

    // Definition-driven session: rebuild the walk from the definition's scope.
    // If the definition can't be fetched, fall back to the resolved type_filter
    // stamped at start — the walk membership may drift slightly but stays usable.
    let walk = { typeFilter, emergencyOnly };
    if (session.definition_id) {
      try {
        const definition = getState().definitions.find(d => d.id === session.definition_id)
          ?? await api.getById('inspection_definitions', session.definition_id);
        if (definition) walk = { definition };
      } catch (err) {
        logger('⚠ resume: definition fetch failed, using stored type_filter:', err.message);
      }
    }
    const buildFn = await prepareWalkBuilder(walk);

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

    // The status each already-inspected component had BEFORE this session — the
    // "was" side of the walk card's status line. recordInspection captured it
    // exactly during the original sitting, but that state died with the reload,
    // so rebuild it from history (latest result recorded before started_at).
    // Non-fatal: without it the card shows "–" rather than a wrong status.
    let statusBefore = {};
    const inspectedIds = Object.keys(inspections);
    if (inspectedIds.length > 0) {
      try {
        const history = await api.getAllIn('component_inspections', 'component_id', inspectedIds, {
          select: 'component_id, inspection_result, inspected_at',
        });
        statusBefore = statusBeforeSession(history, session.started_at);
      } catch (err) {
        logger('⚠ resume: statusBefore history load (non-fatal):', err.message);
      }
    }

    // Rotating session: the walk is its stamped trigger + linked set — never
    // re-derived (mid-walk re-derivation could pin a different trigger).
    if (walk.definition?.mode === 'rotating') {
      const s2       = getState();
      const allComps = Object.values(s2.allComponents).flat();
      let trigger    = allComps.find(c => c.id === session.trigger_component_id) ?? null;
      if (!trigger) {
        // No stored trigger (pre-154 session) or trigger deleted — re-derive.
        const lastTested = await lastDefinitionInspections(walk.definition.id).catch(() => ({}));
        trigger = buildRotatingWalk(walk.definition, {
          components: allComps, floors: s2.floors,
          componentLinks: s2.componentLinks, ctx: walkCtx(s2), lastTested,
        }).trigger;
      }
      const { linked } = resolveLinkedSet(trigger, walk.definition, s2.componentLinks, {
        components: allComps, floors: s2.floors, types: s2.types,
      });
      const walkComponents = trigger ? [trigger, ...linked] : [];
      const floor = s2.floors.find(f => f.id === session.floor_id)
        ?? s2.floors.find(f => f.id === trigger?.floor_id) ?? null;
      update(s => ({
        ...s,
        activeSession:  { ...session, _floorObj: floor, _walk: walk },
        walkComponents,
        currentIndex:   0,
        inspections,
        statusBefore,
        buildingFloors: [],
        currentFloor:   floor,
        floorProgress:  {},
      }));
      return;
    }

    if (session.session_scope === 'building') {
      const facility      = state.facilities.find(f =>
        f.short_name === session.building || f.name === session.building
      );
      const buildingFloors = state.floors
        .filter(f => f.facility_id === (facility?.id ?? null) && f.walk_order != null)
        .sort((a, b) => a.walk_order - b.walk_order);

      const floorProgress = calcFloorProgress(buildingFloors, state.allComponents, buildFn, inspections);

      const currentFloor = buildingFloors.find(f =>
        floorProgress[f.id].inspected < floorProgress[f.id].total
      ) ?? buildingFloors[0];

      const walkComponents = buildFn(state.allComponents[currentFloor.id] ?? []);

      update(s => ({
        ...s,
        activeSession:  { ...session, _walk: walk },
        buildingFloors,
        currentFloor,
        floorProgress,
        walkComponents,
        currentIndex:   0,
        inspections,
        statusBefore,
      }));
    } else {
      const floor = state.floors.find(f => f.id === session.floor_id);
      if (!floor) throw new Error('Floor not found for session');
      const walkComponents = buildFn(state.allComponents[floor.id] ?? []);
      update(s => ({
        ...s,
        activeSession:  { ...session, _floorObj: floor, _walk: walk },
        walkComponents,
        currentIndex:   0,
        inspections,
        statusBefore,
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
    // Push any queued inspections to the server BEFORE counting them, so a
    // just-finished walk whose last saves are still in the outbox isn't stamped
    // with a too-low count (which would falsely read as "unfinished"). Best-effort
    // — offline, this is a no-op and completeSession stays online-only until P4.
    try { await flushQueue(); } catch (e) { logger('⚠ completeSession: flush:', e.message); }
    // Stamp the TRUE inspected count at close. This is the single source of
    // completeness: total_components_count (set at start) vs this. It was never
    // maintained before (always 0), so a finished-early session looked the same
    // as a full one — which broke the schedule (see inspectionSchedule.js).
    let inspectedCount = 0;
    try {
      inspectedCount = await api.count('component_inspections', { walk_session_id: sessionId });
    } catch (e) {
      logger('⚠ completeSession: inspected count failed, leaving as-is:', e.message);
    }
    await api.update('walk_sessions', sessionId, {
      status:                     'closed',
      closed_at:                  new Date().toISOString(),
      inspected_components_count: inspectedCount,
      notes:                      notes || null,
      updated_by:                 userId,
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

  // Reverse the current floor's walk order, in place.
  //
  // Walk order is defined left-to-right, so a building-wide walk naturally
  // alternates: a floor walked low→high ends at the far end, and the floor above
  // is then walked high→low. The walk screen asks which order on every floor
  // arrival and calls this for the reverse answer.
  //
  // currentIndex is deliberately NOT translated. The prompt fires on arrival,
  // where the index is either 0 (entered forwards — the start of this floor's
  // walk) or the last index (entered backwards — its end). Both still mean
  // start/end after the reversal, so keeping the index lands the inspector on
  // the highest walk-order component when the floor runs in reverse.
  function reverseFloorOrder() {
    update(s => ({ ...s, walkComponents: [...s.walkComponents].reverse() }));
  }

  // Rebuild the active session's walk builder from the stashed _walk config.
  // Sync (no fetch): any latest-inspections load already happened at start/resume.
  function activeBuildFn(s) {
    return makeWalkBuilder(s.activeSession?._walk ?? { typeFilter: [], emergencyOnly: false }, walkCtx(s));
  }

  function goNext() {
    update(s => {
      const next = s.currentIndex + 1;
      if (next >= s.walkComponents.length) {
        // End of floor — advance to next non-empty floor for building-wide
        if (s.activeSession?.session_scope === 'building' && s.buildingFloors.length > 0) {
          const ci     = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
          const result = firstNonEmptyFloor(s.buildingFloors, s.allComponents, activeBuildFn(s), ci + 1, 1);
          if (result) {
            return { ...s, currentFloor: result.floor, walkComponents: result.components, currentIndex: 0 };
          }
        }
        return { ...s, currentIndex: s.walkComponents.length - 1 };
      }
      return { ...s, currentIndex: next };
    });
  }

  // Jump straight to a floor (building-wide walks — the tappable floor strip).
  // Rebuilds the walk list for that floor and lands on its first component;
  // the walk screen's floor-change watcher then asks the direction question,
  // same as any other arrival. No-op for single-floor sessions, unknown floors,
  // or the floor already being walked.
  function goToFloor(floorId) {
    update(s => {
      if (s.activeSession?.session_scope !== 'building') return s;
      if (!floorId || floorId === s.currentFloor?.id) return s;
      const floor = s.buildingFloors.find(f => f.id === floorId);
      if (!floor) return s;
      const walkComponents = activeBuildFn(s)(s.allComponents[floor.id] ?? []);
      return { ...s, currentFloor: floor, walkComponents, currentIndex: 0 };
    });
  }

  function goPrev() {
    update(s => {
      const prev = s.currentIndex - 1;
      if (prev < 0) {
        // Start of floor — go back to previous non-empty floor for building-wide
        if (s.activeSession?.session_scope === 'building' && s.buildingFloors.length > 0) {
          const ci     = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
          const result = firstNonEmptyFloor(s.buildingFloors, s.allComponents, activeBuildFn(s), ci - 1, -1);
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
    const ci = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
    return !firstNonEmptyFloor(s.buildingFloors, s.allComponents, activeBuildFn(s), ci + 1, 1);
  }

  function isAtStartOfBuilding() {
    const s = getState();
    if (s.activeSession?.session_scope !== 'building') return false;
    if (s.currentIndex > 0) return false;
    // True only if there is no non-empty floor before the current one
    const ci = s.buildingFloors.findIndex(f => f.id === s.currentFloor?.id);
    return !firstNonEmptyFloor(s.buildingFloors, s.allComponents, activeBuildFn(s), ci - 1, -1);
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
  /**
   * @param {object} args
   * @param {string} args.componentId
   * @param {string} args.result
   * @param {string} [args.notes]
   * @param {string[]} [args.photoUrls]
   * @param {Record<string, boolean|undefined>} [args.checklistResults]
   * @param {string|null} [args.noAccessReason] why the component could not be
   *        assessed; only meaningful (and only persisted) when result==='no_access'
   */
  async function recordInspection({ componentId, result, notes, photoUrls = [], photoBlobs = [], checklistResults = {}, noAccessReason = null, readings = {} }) {
    logger('recordInspection:', componentId, result);
    const userId = await getCurrentUserId();
    const state  = getState();
    const now    = new Date().toISOString();

    const existing = state.inspections[componentId];

    // The status this component holds right now — i.e. before the write below
    // overwrites it. This is the only moment the prior status is known for free;
    // capture it for the walk card's "was → now" line. Only on the FIRST
    // inspection of the component in this session: a re-inspect must not
    // overwrite the original prior status with the previous attempt's result.
    const priorStatus = existing
      ? null
      : (state.walkComponents.find(c => c.id === componentId)?.status ?? null);

    // A reason belongs only to a no_access row — the DB CHECK enforces this, so
    // null it out when re-inspecting a component that was previously no-access.
    const reason = result === 'no_access' ? (noAccessReason || null) : null;
    // A no_access row observed nothing, so it carries no readings either.
    const readingsToSave = result === 'no_access' ? {} : (readings || {});

    // Client-generated id (reused on re-inspect) so the local row and its eventual
    // server row are the SAME record — nothing to remap when the queue syncs.
    const inspectionId = existing?.id ?? newUuid();
    const row = {
      id:                inspectionId,
      walk_session_id:   state.activeSession.id,
      component_id:      componentId,
      inspection_result: result,
      inspector_notes:   notes || null,
      checklist_results: checklistResults,
      readings:          readingsToSave,
      no_access_reason:  reason,
      inspected_by:      userId,
      inspected_at:      now,
    };

    // The "inspection result → component status" rule, built HERE at record time
    // (so status_set_at is the true observation time even if sync happens hours
    // later) and applied to the component by the syncer. Rule stays in public.js.
    const statusPatch = inspectionResultPatch(result, { inspectionId, userId, at: now });
    const payload = { row, photoUrls, photoIds: [], statusPatch };

    // Local-first: stash any captured photo blobs, then enqueue the whole unit
    // durably and let the syncer push it — immediately when online, on reconnect
    // when not. A dropped connection can no longer lose a recorded result OR its
    // photos; photo upload + attachment moves into the syncer (idempotent
    // upsert-by-id + purge-then-add). Where IndexedDB is unavailable (SSR / an old
    // private-mode browser) there is nothing durable to queue into, so upload the
    // blobs and sync inline — behaviour then equals the pre-offline direct write
    // (throws on failure so the walk screen can surface it).
    let queued = false;
    if (isOfflineAvailable()) {
      try {
        const handle = await openQueue();
        for (const pb of photoBlobs) {
          const photoId = newUuid();
          await putPhoto(handle, { photoId, inspectionId, blob: pb.blob, filename: pb.filename, folderPath: pb.folderPath });
          payload.photoIds.push(photoId);
        }
        await enqueueInspectionSave(handle, payload);
        queued = true;
      } catch (e) {
        logger('⚠ enqueue failed, syncing inline:', e.message);
      }
    }
    if (!queued) {
      const deps = makeSyncDeps();
      const inlineUrls = [...photoUrls];
      for (const pb of photoBlobs) inlineUrls.push(await deps.uploadPhoto(pb.blob, { filename: pb.filename, folderPath: pb.folderPath }));
      const res = await syncOne({ type: 'inspection_save', payload: { row, photoUrls: inlineUrls, photoIds: [], statusPatch } }, deps);
      if (!res.ok) throw new Error(res.error || 'Failed to save inspection');
    }

    // In-memory record for the walk UI. Show already-uploaded URLs (normalised)
    // plus local object-URL previews of the just-captured blobs, so photos are
    // visible immediately even before the sync uploads them.
    const blobPreviews = (typeof URL !== 'undefined' && URL.createObjectURL)
      ? photoBlobs.map(pb => URL.createObjectURL(pb.blob))
      : [];
    const inspection = { ...row, photo_urls: [...photoUrls.map(normalisePhotoUrl), ...blobPreviews] };

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

      // Update in-memory component status to match what applyInspectionResult
      // actually wrote. 'no_access' writes NO status (the component was not
      // observed), so the in-memory copy must keep its existing status too —
      // otherwise the UI would show a status the database does not hold.
      const statusChanged = result !== 'no_access';
      const withStatus = (c) => (statusChanged ? { ...c, status: result } : c);

      const updatedAllComponents = { ...s.allComponents };
      if (statusChanged) {
        for (const fid of Object.keys(updatedAllComponents)) {
          updatedAllComponents[fid] = updatedAllComponents[fid].map(c =>
            c.id === componentId ? withStatus(c) : c
          );
        }
      }

      return {
        ...s,
        inspections:    newInsp,
        statusBefore:   existing
          ? s.statusBefore
          : { ...s.statusBefore, [componentId]: priorStatus },
        floorProgress:  newFloorProgress,
        allComponents:  updatedAllComponents,
        walkComponents: s.walkComponents.map(c =>
          c.id === componentId ? withStatus(c) : c
        ),
      };
    });

    const comp = state.walkComponents.find(c => c.id === componentId);
    audit(existing ? 'update' : 'create', 'component_inspection', inspection.id,
      comp?.asset_id ?? componentId, {
        eventAction: existing ? 'inspection_update_inspection' : 'inspection_record_inspection',
        afterData: { componentId, result, session_id: state.activeSession.id },
      });

    // Background drain (online → syncs within a moment; offline → waits).
    if (queued) kickSync();

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
    // If the deleted session is the one being walked, drop the walk state too —
    // otherwise activeSession keeps pointing at a row that no longer exists.
    // (Used by the finish sheet's "delete inspection" for a zero-progress walk.)
    update(s => (s.activeSession?.id === sessionId ? { ...s, ...RESET_SESSION_STATE } : s));
    await loadSessions();
  }

  // -- Public API ----------------------------------------------------------------

  return {
    subscribe,
    load,
    loadSessions,
    ensureLatestInspections,
    startSession,
    startBuildingWideSession,
    startRotatingSession,
    resumeSession,
    pauseSession,
    completeSession,
    closeSession,
    deleteSession,
    goToIndex,
    goToFloor,
    goNext,
    goPrev,
    reverseFloorOrder,
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
