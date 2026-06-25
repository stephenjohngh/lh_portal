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
    create:     vi.fn((table, data) => Promise.resolve({ id: `${table}-new`, ...data })),
    update:     vi.fn((table, id, data) => Promise.resolve({ id, ...data })),
    delete:     vi.fn(() => Promise.resolve()),
    deleteMany: vi.fn(() => Promise.resolve()),
    createMany: vi.fn(() => Promise.resolve([])),
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
  it('closes the session and resets the active-session state', async () => {
    const session = await startWalk();
    await inspectionStore.completeSession(session.id, 'all good');
    expect(h.api.update).toHaveBeenCalledWith('walk_sessions', session.id,
      expect.objectContaining({ status: 'closed', notes: 'all good' }), false);
    expect(get(inspectionStore).activeSession).toBeNull();
    expect(get(inspectionStore).walkComponents).toEqual([]);
  });
});

describe('deleteSession', () => {
  it('deletes the session inspections then the session and reloads', async () => {
    await inspectionStore.deleteSession('sess9');
    expect(h.api.deleteMany).toHaveBeenCalledWith('component_inspections', { walk_session_id: 'sess9' });
    expect(h.api.delete).toHaveBeenCalledWith('walk_sessions', 'sess9');
    expect(h.api.get).toHaveBeenCalledWith('walk_sessions', expect.any(Object)); // loadSessions
  });
});
