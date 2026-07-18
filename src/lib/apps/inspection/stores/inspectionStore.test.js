// src/lib/apps/inspection/stores/inspectionStore.test.js
//
// CHARACTERIZATION tests for inspectionStore. Pins the contract of the data
// layer: load() indexes components by floor; startSession builds the walk list
// and stages a single_floor session; recordInspection creates-or-updates the
// inspection, stamps the component status + last_inspection_id, and manages the
// media_attachments rows; navigation clamps; completeSession closes + resets;
// deleteSession tears down inspections then the session.
//
// Seams mocked: supabaseClient (auth + media_attachments query chains), api,
// auditLogger, logger, driveUtils (storage side-effects). The pure walk helpers
// in inspectionWalk.js and the hierarchy/sort utils are left REAL — they have
// their own unit tests and exercising them keeps this test honest.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  // Per-table fixtures returned by api.get / api.getAll.
  let tables = {};
  let media  = { data: [], error: null };   // what the media_attachments chain resolves to

  const makeBuilder = () => {
    const b = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'in', 'delete', 'insert']) b[m] = vi.fn(chain);
    b.then = (res, rej) => Promise.resolve(media).then(res, rej);
    return b;
  };

  const supabase = {
    auth: {
      getUser:    vi.fn(() => Promise.resolve({ data: { user: { id: 'u1', email: 'u@x' } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'tok' } } })),
    },
    from: vi.fn(() => makeBuilder()),
  };

  const api = {
    get:        vi.fn((table) => Promise.resolve(tables[table] ?? [])),
    getAll:     vi.fn((table) => Promise.resolve(tables[table] ?? [])),
    getById:    vi.fn((table, id) => Promise.resolve((tables[table] ?? []).find(r => r.id === id) ?? null)),
    create:     vi.fn((table, data) => Promise.resolve({ id: `${table}-new`, ...data })),
    update:     vi.fn((table, id, data) => Promise.resolve({ id, ...data })),
    delete:     vi.fn(() => Promise.resolve()),
    deleteMany: vi.fn(() => Promise.resolve()),
    createMany: vi.fn(() => Promise.resolve([])),
    getAllIn:   vi.fn((table) => Promise.resolve(tables[table] ?? [])),
    count:      vi.fn(() => Promise.resolve(0)),
    latestInspections: vi.fn(() => Promise.resolve([])),
  };

  return {
    supabase, api, logAudit: vi.fn(),
    setTables: (t) => { tables = t; },
    setMedia:  (m) => { media = m; },
  };
});

vi.mock('$lib/supabaseClient',          () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/api',               () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger',       () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',            () => ({ getLogger: () => () => {} }));
vi.mock('$lib/utils/driveUtils.js',     () => ({
  normalisePhotoUrl: (u) => u,
  deleteStorageFiles: vi.fn(() => Promise.resolve()),
}));

const { inspectionStore } = await import('./inspectionStore.js');

// Standard fixture: one facility, one floor, two fire-door components.
const FIXTURE = {
  facilities:  [{ id: 'fac1', short_name: 'BLDG', name: 'Building' }],
  floors:      [{ id: 'f1', facility_id: 'fac1', level_order: 1, short_name: 'L1', walk_order: 1 }],
  profiles:    [{ full_name: 'Alice' }],
  components:  [
    { id: 'comp1', floor_id: 'f1', type_code: 'FD', asset_id: 'A1', status: 'ok' },
    { id: 'comp2', floor_id: 'f1', type_code: 'FD', asset_id: 'A2', status: 'ok' },
  ],
};
const FLOOR = FIXTURE.floors[0];

// Run load() then start a single-floor walk over the two components.
async function startWalk() {
  await inspectionStore.load();
  return inspectionStore.startSession({
    building: 'BLDG', floor: FLOOR, typeFilter: ['FD'], emergencyOnly: false,
    sessionName: 'S1', sessionType: 'inspection', preset: 'all',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.setTables({ ...FIXTURE });
  h.setMedia({ data: [], error: null });
});

describe('load', () => {
  it('indexes components by floor_id and clears loading', async () => {
    await inspectionStore.load();
    const s = get(inspectionStore);
    expect(s.allComponents.f1.map(c => c.id)).toEqual(['comp1', 'comp2']);
    expect(s.floors).toHaveLength(1);
    expect(s.loading).toBe(false);
  });

  it('records the error and rethrows on failure', async () => {
    h.api.get.mockRejectedValueOnce(new Error('boom'));
    await expect(inspectionStore.load()).rejects.toThrow('boom');
    expect(get(inspectionStore).error).toBe('boom');
  });
});

describe('startSession', () => {
  it('creates a single_floor session and builds the walk list', async () => {
    const session = await startWalk();
    const createArg = h.api.create.mock.calls.find(c => c[0] === 'walk_sessions')[1];
    expect(createArg).toMatchObject({
      session_scope: 'single_floor', floor_id: 'f1', status: 'open',
      inspector_name: 'Alice', total_components_count: 2,
    });
    const s = get(inspectionStore);
    expect(s.activeSession.id).toBe(session.id);
    expect(s.walkComponents.map(c => c.id)).toEqual(['comp1', 'comp2']);
    expect(s.currentFloor.id).toBe('f1');
  });

  it('a repair session targeting one component limits the walk list to it', async () => {
    await inspectionStore.load();
    await inspectionStore.startSession({
      building: 'BLDG', floor: FLOOR, typeFilter: ['FD'], emergencyOnly: false,
      sessionName: 'R', sessionType: 'repair', preset: 'all', targetComponentId: 'comp2',
    });
    expect(get(inspectionStore).walkComponents.map(c => c.id)).toEqual(['comp2']);
  });

  it('excludes a walk-order-0 (internal) component from a normal walk, but a targeted repair still reaches it', async () => {
    h.setTables({
      ...FIXTURE,
      components: [
        { id: 'comp1',    floor_id: 'f1', type_code: 'FD', asset_id: 'A1',  status: 'ok', inspection_sort_order: 1 },
        { id: 'internal', floor_id: 'f1', type_code: 'FD', asset_id: 'INT', status: 'ok', inspection_sort_order: 0 },
      ],
    });
    await inspectionStore.load();

    // Normal inspection walk: the order-0 internal component is excluded.
    await inspectionStore.startSession({
      building: 'BLDG', floor: FLOOR, typeFilter: ['FD'], emergencyOnly: false,
      sessionName: 'S', sessionType: 'inspection', preset: 'all',
    });
    expect(get(inspectionStore).walkComponents.map(c => c.id)).toEqual(['comp1']);

    // Targeted repair: the internal component is still reachable.
    await inspectionStore.startSession({
      building: 'BLDG', floor: FLOOR, typeFilter: ['FD'], emergencyOnly: false,
      sessionName: 'R', sessionType: 'repair', preset: 'all', targetComponentId: 'internal',
    });
    expect(get(inspectionStore).walkComponents.map(c => c.id)).toEqual(['internal']);
  });
});

describe('definition sessions (configurable inspections)', () => {
  const DEFINITION = {
    id: 'def1', name: 'Fire Doors', active: true, mode: 'standard',
    scope: { typeCodes: ['FD'] }, frequency_days: 7,
  };

  it('startSession with a definition applies its scope, stamps definition_id + resolved type_filter', async () => {
    await inspectionStore.load();
    await inspectionStore.startSession({
      building: 'BLDG', floor: FLOOR, sessionName: 'D1', sessionType: 'test',
      definition: DEFINITION,
    });

    const createArg = h.api.create.mock.calls.find(c => c[0] === 'walk_sessions')[1];
    expect(createArg).toMatchObject({
      definition_id: 'def1', session_preset: 'custom', emergency_only: false,
      session_scope: 'single_floor', total_components_count: 2,
    });
    expect(JSON.parse(createArg.type_filter)).toEqual(['FD']);   // resolved from matched components
    expect(get(inspectionStore).walkComponents.map(c => c.id)).toEqual(['comp1', 'comp2']);
    expect(get(inspectionStore).activeSession._walk.definition.id).toBe('def1');
  });

  it('a definition scope that matches nothing yields an empty walk (not the full floor)', async () => {
    await inspectionStore.load();
    await inspectionStore.startSession({
      building: 'BLDG', floor: FLOOR, sessionName: 'D0', sessionType: 'test',
      definition: { ...DEFINITION, scope: { typeCodes: ['nope'] } },
    });
    expect(get(inspectionStore).walkComponents).toEqual([]);
  });

  it('resumeSession on a definition session rebuilds the walk from the definition scope', async () => {
    h.setTables({ ...FIXTURE, inspection_definitions: [DEFINITION] });
    await inspectionStore.load();
    await inspectionStore.resumeSession({
      id: 'sess1', session_scope: 'single_floor', floor_id: 'f1', status: 'open',
      definition_id: 'def1', type_filter: '[]', emergency_only: false,
    });
    // type_filter is '[]' — an empty legacy filter would produce an empty walk,
    // so a populated walk proves the definition scope drove it.
    expect(get(inspectionStore).walkComponents.map(c => c.id)).toEqual(['comp1', 'comp2']);
    expect(get(inspectionStore).activeSession._walk.definition.id).toBe('def1');
  });
});

describe('rotating sessions', () => {
  // Two call points (cp1 walks first) + a bell linked from each; the ref format
  // is "{floorSN}/{typeInitial}/{assetId}" and FIXTURE's floor is L1.
  const ROT_FIXTURE = {
    ...FIXTURE,
    component_types: [
      { id: 't-cp', code: 'CP',   initial: 'CP' },
      { id: 't-b',  code: 'bell', initial: 'B' },
    ],
    components: [
      { id: 'cp1',   floor_id: 'f1', type_code: 'CP',   asset_id: 'CP1', status: 'ok' },
      { id: 'cp2',   floor_id: 'f1', type_code: 'CP',   asset_id: 'CP2', status: 'ok' },
      { id: 'bell1', floor_id: 'f1', type_code: 'bell', asset_id: 'B1',  status: 'ok' },
    ],
    component_links: [
      { id: 'l1', from_component_id: 'cp1', to_component_ref: 'L1/B/B1', link_type: 'fire' },
    ],
  };
  const ROT_DEF = {
    id: 'rot1', name: 'Weekly Call Point', active: true, mode: 'rotating',
    scope: { typeCodes: ['CP'] }, frequency_days: 7,
    link_source: 'component_links', link_type_filter: null,
  };

  it('startRotatingSession pins the next trigger + linked set and stamps trigger_component_id', async () => {
    h.setTables({ ...ROT_FIXTURE });
    await inspectionStore.load();
    await inspectionStore.startRotatingSession({
      building: 'BLDG', definition: ROT_DEF, sessionName: 'R1', sessionType: 'test',
    });

    const createArg = h.api.create.mock.calls.find(c => c[0] === 'walk_sessions')[1];
    expect(createArg).toMatchObject({
      definition_id: 'rot1', trigger_component_id: 'cp1',
      session_scope: 'single_floor', floor_id: 'f1', total_components_count: 2,
    });
    // Trigger pinned first, then its resolved linked set.
    expect(get(inspectionStore).walkComponents.map(c => c.id)).toEqual(['cp1', 'bell1']);
  });

  it('resumeSession rebuilds the walk from the STAMPED trigger, not a fresh derivation', async () => {
    h.setTables({ ...ROT_FIXTURE, inspection_definitions: [ROT_DEF] });
    await inspectionStore.load();
    // cp2 has no links → walk is just cp2. A fresh derivation (nothing tested)
    // would pick cp1, so cp2 proves the stored trigger drove it.
    await inspectionStore.resumeSession({
      id: 'sessR', session_scope: 'single_floor', floor_id: 'f1', status: 'open',
      definition_id: 'rot1', trigger_component_id: 'cp2',
      type_filter: '[]', emergency_only: false,
    });
    expect(get(inspectionStore).walkComponents.map(c => c.id)).toEqual(['cp2']);
  });
});

describe('navigation', () => {
  it('goNext/goPrev/goToIndex clamp within the walk list', async () => {
    await startWalk(); // currentIndex 0, two components
    inspectionStore.goNext();
    expect(get(inspectionStore).currentIndex).toBe(1);
    inspectionStore.goNext();                       // clamp at last
    expect(get(inspectionStore).currentIndex).toBe(1);
    inspectionStore.goToIndex(99);                  // clamp high
    expect(get(inspectionStore).currentIndex).toBe(1);
    inspectionStore.goPrev();
    expect(get(inspectionStore).currentIndex).toBe(0);
    inspectionStore.goPrev();                       // clamp at 0
    expect(get(inspectionStore).currentIndex).toBe(0);
  });
});

describe('statusBefore (the walk card\'s "was → now" line)', () => {
  it('recordInspection captures the status held before the write, and a re-inspect keeps it', async () => {
    await startWalk();                                    // comp1 starts 'ok'
    await inspectionStore.recordInspection({ componentId: 'comp1', result: 'failed' });
    expect(get(inspectionStore).statusBefore.comp1).toBe('ok');

    // Re-inspecting must not overwrite the original prior status with the
    // previous attempt's result ('failed') — "was" is still 'ok'.
    await inspectionStore.recordInspection({ componentId: 'comp1', result: 'problem' });
    expect(get(inspectionStore).statusBefore.comp1).toBe('ok');
  });

  it('resumeSession rebuilds it from inspections recorded BEFORE started_at', async () => {
    h.setTables({
      ...FIXTURE,
      component_inspections: [
        // comp1's prior state — the last inspection before this session began.
        { id: 'i0', component_id: 'comp1', inspection_result: 'failed', inspected_at: '2026-01-01T00:00:00.000Z' },
        // this session's own inspection, which already overwrote components.status
        { id: 'i1', component_id: 'comp1', inspection_result: 'ok',     inspected_at: '2026-07-15T11:00:00.000Z' },
      ],
    });
    await inspectionStore.load();
    await inspectionStore.resumeSession({
      id: 'sess1', session_scope: 'single_floor', floor_id: 'f1', status: 'open',
      type_filter: '["FD"]', emergency_only: false, started_at: '2026-07-15T10:00:00.000Z',
    });
    // 'failed', NOT the 'ok' this session set — the line stays truthful across a reload.
    expect(get(inspectionStore).statusBefore.comp1).toBe('failed');
  });

  it('resumeSession omits a component whose only inspection is this session\'s', async () => {
    h.setTables({
      ...FIXTURE,
      component_inspections: [
        { id: 'i1', component_id: 'comp1', inspection_result: 'ok', inspected_at: '2026-07-15T11:00:00.000Z' },
      ],
    });
    await inspectionStore.load();
    await inspectionStore.resumeSession({
      id: 'sess1', session_scope: 'single_floor', floor_id: 'f1', status: 'open',
      type_filter: '["FD"]', emergency_only: false, started_at: '2026-07-15T10:00:00.000Z',
    });
    // Unknown, so absent → the card shows "–" rather than echoing the new status.
    expect(get(inspectionStore).statusBefore).not.toHaveProperty('comp1');
  });
});

describe('goToFloor (tappable floor strip)', () => {
  const TWO_FLOOR_FIXTURE = {
    ...FIXTURE,
    floors: [
      { id: 'f1', facility_id: 'fac1', level_order: 1, short_name: 'L1', walk_order: 1 },
      { id: 'f2', facility_id: 'fac1', level_order: 2, short_name: 'L2', walk_order: 2 },
    ],
    components: [
      { id: 'comp1', floor_id: 'f1', type_code: 'FD', asset_id: 'A1', status: 'ok' },
      { id: 'comp2', floor_id: 'f2', type_code: 'FD', asset_id: 'B1', status: 'ok' },
      { id: 'comp3', floor_id: 'f2', type_code: 'FD', asset_id: 'B2', status: 'ok' },
    ],
  };

  it('jumps a building session to the floor, rebuilds the walk list, resets the index', async () => {
    h.setTables({ ...TWO_FLOOR_FIXTURE });
    await inspectionStore.load();
    await inspectionStore.startBuildingWideSession({
      building: 'BLDG', typeFilter: ['FD'], emergencyOnly: false,
      sessionName: 'B', sessionType: 'inspection', preset: 'all',
    });
    expect(get(inspectionStore).currentFloor.id).toBe('f1');

    inspectionStore.goToFloor('f2');
    const s = get(inspectionStore);
    expect(s.currentFloor.id).toBe('f2');
    expect(s.walkComponents.map(c => c.id)).toEqual(['comp2', 'comp3']);
    expect(s.currentIndex).toBe(0);
  });

  it('is a no-op for single-floor sessions and unknown floors', async () => {
    await startWalk();   // single_floor on f1
    inspectionStore.goToFloor('f2');
    expect(get(inspectionStore).currentFloor.id).toBe('f1');

    h.setTables({ ...TWO_FLOOR_FIXTURE });
    await inspectionStore.load();
    await inspectionStore.startBuildingWideSession({
      building: 'BLDG', typeFilter: ['FD'], emergencyOnly: false,
      sessionName: 'B', sessionType: 'inspection', preset: 'all',
    });
    inspectionStore.goToFloor('nope');
    expect(get(inspectionStore).currentFloor.id).toBe('f1');
  });
});

describe('reverseFloorOrder', () => {
  it('reverses the floor walk list and leaves currentIndex alone', async () => {
    await startWalk(); // currentIndex 0, [comp1, comp2] in walk order
    inspectionStore.reverseFloorOrder();
    const s = get(inspectionStore);
    // Index is NOT translated: the walk screen asks on floor arrival, where
    // index 0 means "start of this floor's walk" either way — so after the flip
    // it lands on the highest walk-order component, not back on comp1.
    expect(s.walkComponents.map(c => c.id)).toEqual(['comp2', 'comp1']);
    expect(s.currentIndex).toBe(0);
  });

  it('entering a floor backwards (index at the end) still lands on that end after reversing', async () => {
    await startWalk();
    inspectionStore.goToIndex(1);        // as goPrev leaves it on arrival from above
    inspectionStore.reverseFloorOrder();
    const s = get(inspectionStore);
    expect(s.currentIndex).toBe(1);
    expect(s.walkComponents[s.currentIndex].id).toBe('comp1');  // the reversed floor's last stop
  });
});

describe('recordInspection', () => {
  it('CREATE path: inserts the inspection, stamps last_inspection_id + status, saves photos, audits create', async () => {
    await startWalk();
    const insp = await inspectionStore.recordInspection({
      componentId: 'comp1', result: 'failed', notes: 'cracked', photoUrls: ['https://store/p.jpg'],
    });

    const inspArg = h.api.create.mock.calls.find(c => c[0] === 'component_inspections')[1];
    expect(inspArg).toMatchObject({ component_id: 'comp1', inspection_result: 'failed', inspected_by: 'u1' });
    // The "inspection result → component status" rule now runs as ONE write via
    // the Building Assets public interface (applyInspectionResult): status +
    // last_inspection_id + status_set_by/at + updated_by — no longer two
    // separate api.update calls, and status_set_by/at are no longer omitted.
    expect(h.api.update).toHaveBeenCalledWith('components', 'comp1', expect.objectContaining({
      status:             'failed',
      last_inspection_id: insp.id,
      status_set_by:      'u1',
      status_set_at:      expect.any(String),
      updated_by:         'u1',
    }));
    // photos persisted to media_attachments
    const insertedRows = h.supabase.from.mock.results.map(r => r.value)
      .flatMap(b => b.insert.mock.calls).map(c => c[0]);
    expect(insertedRows.flat()).toEqual([expect.objectContaining({ entity_type: 'component_inspection', storage_url: 'https://store/p.jpg' })]);
    // store + audit
    expect(get(inspectionStore).inspections.comp1.id).toBe(insp.id);
    expect(h.logAudit).toHaveBeenCalledWith('create', 'component_inspection', insp.id, 'A1', expect.any(Object));
  });

  it('UPDATE path: a second inspection of the same component updates + clears old photos, audits update', async () => {
    await startWalk();
    await inspectionStore.recordInspection({ componentId: 'comp1', result: 'ok' });   // create
    h.logAudit.mockClear();
    await inspectionStore.recordInspection({ componentId: 'comp1', result: 'problem' }); // update

    // updated the existing inspection row (not a second create)
    expect(h.api.update).toHaveBeenCalledWith('component_inspections', expect.any(String), expect.objectContaining({ inspection_result: 'problem' }));
    expect(h.logAudit).toHaveBeenCalledWith('update', 'component_inspection', expect.any(String), 'A1', expect.any(Object));
  });
});

describe('completeSession', () => {
  it('closes the session, stamps the true inspected count, and resets state', async () => {
    const session = await startWalk();
    h.api.count.mockResolvedValueOnce(2);   // 2 components inspected this session
    await inspectionStore.completeSession(session.id, 'all good');
    // The count is queried for THIS session and written to the row so the
    // schedule can tell a completed run from a finished-early one.
    expect(h.api.count).toHaveBeenCalledWith('component_inspections', { walk_session_id: session.id });
    expect(h.api.update).toHaveBeenCalledWith('walk_sessions', session.id,
      expect.objectContaining({ status: 'closed', notes: 'all good', inspected_components_count: 2 }), false);
    expect(get(inspectionStore).activeSession).toBeNull();
    expect(get(inspectionStore).walkComponents).toEqual([]);
  });
});

describe('deleteSession', () => {
  it('clears the walk state when the ACTIVE session is deleted', async () => {
    const session = await startWalk();
    expect(get(inspectionStore).activeSession).not.toBeNull();
    // The finish sheet's "delete inspection" (zero-progress undo) deletes the
    // session being walked — the store must not keep pointing at a dead row.
    await inspectionStore.deleteSession(session.id);
    expect(get(inspectionStore).activeSession).toBeNull();
    expect(get(inspectionStore).walkComponents).toEqual([]);
  });

  it('leaves an unrelated active session alone', async () => {
    const session = await startWalk();
    await inspectionStore.deleteSession('some-other-session');
    expect(get(inspectionStore).activeSession?.id).toBe(session.id);
  });

  it('deletes the session (FK cascade removes inspections) and reloads', async () => {
    await inspectionStore.deleteSession('sess9');
    expect(h.api.delete).toHaveBeenCalledWith('walk_sessions', 'sess9');
    expect(h.api.deleteMany).not.toHaveBeenCalled(); // cascade handles component_inspections
    expect(h.api.get).toHaveBeenCalledWith('walk_sessions', expect.any(Object)); // loadSessions
  });
});
