// src/lib/apps/building_assets/stores/buildingAssetsStore.test.js
//
// CHARACTERIZATION tests for buildingAssetsStore — the orchestrator and its five
// composed action modules (type-hierarchy, component, plan, space, annotation).
// These pin the public contract: which api calls each method makes and the
// resulting shared store state. Because the orchestrator just spreads the
// modules onto one writable, testing the singleton exercises the real wiring.
//
// Seams mocked: api, supabaseClient (storage for plan images), auditLogger,
// logger, and $lib/stores/auth (so the real requireUserId helper resolves a
// user). resolveHierarchy and the helpers module are left REAL.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  let tables = {};
  let throwSet = new Set();      // tables whose api.get should reject (graceful-degradation tests)
  let inspections = [];
  let idSeq = 0;

  const api = {
    get:    vi.fn((table) => throwSet.has(table)
      ? Promise.reject(new Error(`${table} missing`))
      : Promise.resolve(tables[table] ?? [])),
    getAll: vi.fn((table) => Promise.resolve(tables[table] ?? [])),
    getAllIn: vi.fn((table) => Promise.resolve(tables[table] ?? [])),
    latestInspections: vi.fn(() => Promise.resolve(inspections)),
    create:     vi.fn((table, data) => Promise.resolve({ id: `${table}-${++idSeq}`, ...data })),
    createMany: vi.fn((table, rows, ret) => Promise.resolve(ret ? rows.map((r, i) => ({ id: `${table}-m${i}`, ...r })) : [])),
    update:     vi.fn((table, id, data) => Promise.resolve({ id, ...data })),
    delete:     vi.fn(() => Promise.resolve()),
    deleteMany: vi.fn(() => Promise.resolve()),
  };

  const supabase = {
    storage: {
      from: vi.fn(() => ({
        upload:       vi.fn(() => Promise.resolve({ error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://cdn/plan.png' } })),
      })),
    },
  };

  return {
    api, supabase, logAudit: vi.fn(),
    setTables:  (t) => { tables = t; },
    setThrow:   (s) => { throwSet = new Set(s); },
    setInspections: (i) => { inspections = i; },
  };
});

vi.mock('$lib/utils/api',         () => ({ api: h.api }));
vi.mock('$lib/supabaseClient',    () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',      () => ({ getLogger: () => () => {} }));
vi.mock('$lib/stores/auth',       () => ({
  auth: { subscribe: (run) => { run({ user: { id: 'u1' } }); return () => {}; } },
}));

const { buildingAssetsStore: store } = await import('./buildingAssetsStore.js');

// Load a set of components into store state (loadComponents reads api.getAll).
async function loadComps(components, attrs = [], links = []) {
  h.setTables({ components, component_attributes: attrs, component_links: links });
  await store.loadComponents();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.setTables({});
  h.setThrow([]);
  h.setInspections([]);
});

// ── Orchestrator: load ─────────────────────────────────────────────────────────
describe('load', () => {
  it('loads hierarchy, plans, spaces and annotations into state', async () => {
    h.setTables({
      facilities: [{ id: 'fac1' }],
      floors:     [{ id: 'f1', level_order: 1 }],
      plans:      [{ id: 'p1', building: 'A' }],
      spaces:     [{ id: 'sp1' }],
      plan_annotations: [{ id: 'an1' }],
    });
    await store.load();
    const s = get(store);
    expect(s.facilities).toHaveLength(1);
    expect(s.plans).toHaveLength(1);
    expect(s.spaces).toHaveLength(1);
    expect(s.annotations).toHaveLength(1);
    expect(s.loading).toBe(false);
  });

  it('degrades gracefully when the spaces table is unavailable', async () => {
    h.setTables({ plan_annotations: [] });
    h.setThrow(['spaces']);                 // migration 018 not applied
    await store.load();
    expect(get(store).spaces).toEqual([]);  // swallowed, not fatal
    expect(get(store).error).toBeNull();
  });
});

// ── componentActions ────────────────────────────────────────────────────────────
describe('loadComponents', () => {
  it('indexes attrs by component, dedupes latest inspection, sorts components newest-first', async () => {
    h.setInspections([{ component_id: 'c1', inspection_result: 'ok' }]);
    await loadComps(
      [{ id: 'c1', created_at: '2026-01-01' }, { id: 'c2', created_at: '2026-03-01' }],
      [{ component_id: 'c1', type_attribute_id: 't1', value: 'x' }],
    );
    const s = get(store);
    expect(s.components.map(c => c.id)).toEqual(['c2', 'c1']);   // created_at desc
    expect(s.componentAttrs.c1).toHaveLength(1);
    expect(s.inspections.c1.inspection_result).toBe('ok');
    expect(s.loadingComponents).toBe(false);
  });
});

describe('createComponent', () => {
  it('creates with status ok + creator and inserts only non-empty attribute rows', async () => {
    const comp = await store.createComponent(
      { type_code: 'FD', label: 'Door 1' },
      [{ type_attribute_id: 't1', value: 'fire' }, { type_attribute_id: 't2', value: '' }],
    );
    const createArg = h.api.create.mock.calls.find(c => c[0] === 'components')[1];
    expect(createArg).toMatchObject({ type_code: 'FD', status: 'ok', created_by: 'u1', updated_by: 'u1' });
    const attrRows = h.api.createMany.mock.calls[0][1];
    expect(attrRows).toEqual([{ component_id: comp.id, type_attribute_id: 't1', value: 'fire' }]);
    expect(h.logAudit).toHaveBeenCalledWith('create', 'component', comp.id, expect.any(String), expect.any(Object));
  });
});

describe('updateComponent / moveComponent / deleteComponent', () => {
  it('updateComponent stamps updated_by and merges into state', async () => {
    await loadComps([{ id: 'c1', label: 'old' }]);
    await store.updateComponent('c1', { label: 'new' });
    expect(h.api.update).toHaveBeenCalledWith('components', 'c1', expect.objectContaining({ label: 'new', updated_by: 'u1' }));
    expect(get(store).components.find(c => c.id === 'c1').label).toBe('new');
  });

  it('moveComponent rounds coordinates to 3dp and updates state', async () => {
    await loadComps([{ id: 'c1' }]);
    await store.moveComponent('c1', 'p9', 0.123456, 0.654321);
    const arg = h.api.update.mock.calls.find(c => c[0] === 'components')[2];
    expect(arg).toMatchObject({ plan_id: 'p9', x_position: 0.123, y_position: 0.654 });
    expect(get(store).components[0].x_position).toBe(0.123);
  });

  it('deleteComponent removes it from state and audits with beforeData', async () => {
    await loadComps([{ id: 'c1', label: 'Gone' }, { id: 'c2' }]);
    await store.deleteComponent('c1');
    expect(h.api.delete).toHaveBeenCalledWith('components', 'c1');
    expect(get(store).components.map(c => c.id)).toEqual(['c2']);
    expect(h.logAudit).toHaveBeenCalledWith('delete', 'component', 'c1', 'Gone',
      expect.objectContaining({ beforeData: expect.objectContaining({ id: 'c1' }) }));
  });
});

describe('updateComponentAttrs', () => {
  it('replaces the attribute set (delete-all then insert non-empty)', async () => {
    await store.updateComponentAttrs('c1', { t1: 'a', t2: '', t3: 'b' });
    expect(h.api.deleteMany).toHaveBeenCalledWith('component_attributes', { component_id: 'c1' });
    const rows = h.api.createMany.mock.calls[0][1];
    expect(rows.map(r => r.type_attribute_id)).toEqual(['t1', 't3']);
    expect(get(store).componentAttrs.c1).toHaveLength(2);
  });
});

describe('saveInspection', () => {
  it('creates the inspection, mirrors status onto the component, and back-references it', async () => {
    await loadComps([{ id: 'c1', status: 'ok' }]);
    const insp = await store.saveInspection('c1', { result: 'failed', notes: ' cracked ', checklistResults: {} });

    const inspArg = h.api.create.mock.calls.find(c => c[0] === 'component_inspections')[1];
    expect(inspArg).toMatchObject({ component_id: 'c1', inspection_result: 'failed', inspected_by: 'u1' });
    expect(inspArg.checklist_results).toBeNull();          // empty checklist → null
    expect(h.api.update).toHaveBeenCalledWith('components', 'c1',
      expect.objectContaining({ status: 'failed', last_inspection_id: insp.id }));
    const s = get(store);
    expect(s.inspections.c1.id).toBe(insp.id);
    expect(s.components[0].status).toBe('failed');
  });
});

describe('component links', () => {
  it('addComponentLink trims the ref and appends under the from-component', async () => {
    await loadComps([{ id: 'c1' }]);   // reset componentLinks (store is a singleton across tests)
    const link = await store.addComponentLink('c1', '  L1/D/A2  ', ' serves ');
    const arg = h.api.create.mock.calls.find(c => c[0] === 'component_links')[1];
    expect(arg).toMatchObject({ from_component_id: 'c1', to_component_ref: 'L1/D/A2', link_type: 'serves' });
    expect(get(store).componentLinks.c1).toEqual([link]);
  });

  it('deleteComponentLink removes it from the from-component bucket', async () => {
    await loadComps([{ id: 'c1' }]);   // reset componentLinks (store is a singleton across tests)
    const link = await store.addComponentLink('c1', 'ref', null);
    await store.deleteComponentLink(link.id, 'c1');
    expect(h.api.delete).toHaveBeenCalledWith('component_links', link.id);
    expect(get(store).componentLinks.c1).toEqual([]);
  });
});

// ── spaceActions ─────────────────────────────────────────────────────────────────
describe('spaceActions', () => {
  it('createSpace rounds the polygon, strips the colour hash, preserves the name', async () => {
    const space = await store.createSpace({
      plan_id: 'p1', name: '  Indented Room', colour: '#3c9683',
      polygon: [{ x: 0.111111, y: 0.999999 }, { x: 0.5, y: 0.5 }],
    });
    const arg = h.api.create.mock.calls.find(c => c[0] === 'spaces')[1];
    expect(arg.colour).toBe('3c9683');                       // hash stripped
    expect(arg.name).toBe('  Indented Room');                // whitespace preserved
    expect(arg.polygon).toEqual([{ x: 0.111, y: 1 }, { x: 0.5, y: 0.5 }]);
    expect(get(store).spaces).toContainEqual(space);
  });

  it('deleteSpace removes it from state', async () => {
    const space = await store.createSpace({ plan_id: 'p1', name: 'R', colour: 'none', polygon: [] });
    await store.deleteSpace(space.id);
    expect(h.api.delete).toHaveBeenCalledWith('spaces', space.id);
    expect(get(store).spaces.find(s => s.id === space.id)).toBeUndefined();
  });
});

// ── annotationActions ────────────────────────────────────────────────────────────
describe('annotationActions', () => {
  it('createAnnotation appends with the creator stamped', async () => {
    const ann = await store.createAnnotation({ plan_id: 'p1', text: 'Boiler room', x_position: 0.2, y_position: 0.3 });
    const arg = h.api.create.mock.calls.find(c => c[0] === 'plan_annotations')[1];
    expect(arg).toMatchObject({ text: 'Boiler room', created_by: 'u1' });
    expect(get(store).annotations).toContainEqual(ann);
  });

  it('moveAnnotation patches the position in state', async () => {
    const ann = await store.createAnnotation({ plan_id: 'p1', text: 'X', x_position: 0, y_position: 0 });
    await store.moveAnnotation(ann.id, 0.7, 0.8);
    const moved = get(store).annotations.find(a => a.id === ann.id);
    expect(moved).toMatchObject({ x_position: 0.7, y_position: 0.8 });
  });
});

// ── typeHierarchyActions ─────────────────────────────────────────────────────────
describe('typeHierarchyActions', () => {
  it('reload repopulates systems and types', async () => {
    h.setTables({ building_systems: [{ id: 'sys1' }], component_types: [{ id: 'ty1', code: 'fd' }] });
    await store.reload();
    const s = get(store);
    expect(s.systems).toHaveLength(1);
    expect(s.types).toHaveLength(1);
  });

  it('createType normalises the code (lowercase, underscores), colour and initial', async () => {
    await store.createType({ building_system_id: 'sys1', code: 'Fire Door', name: 'Fire Door', initial: 'fd', colour: '#abcdef' });
    const arg = h.api.create.mock.calls.find(c => c[0] === 'component_types')[1];
    expect(arg.code).toBe('fire_door');
    expect(arg.colour).toBe('abcdef');
    expect(arg.initial).toBe('F');
  });

  it('createAttrDef routes to system scope when a building_system_id is given', async () => {
    await store.createAttrDef({ name: 'Fire rating', building_system_id: 'sys1', component_type_id: 'ty1' });
    const arg = h.api.create.mock.calls.find(c => c[0] === 'type_attributes')[1];
    expect(arg.building_system_id).toBe('sys1');
    expect(arg).not.toHaveProperty('component_type_id');   // system scope wins
  });

  it('clearPrimaryForType flips is_primary off for every primary in the effective set', async () => {
    // Seed attrDefs via reload's resolveHierarchy: a type with two primaries.
    h.setTables({
      component_types: [{ id: 'ty1', code: 'fd' }],
      type_attributes: [
        { id: 'a1', component_type_id: 'ty1', is_primary: true,  presentation_order: 1 },
        { id: 'a2', component_type_id: 'ty1', is_primary: true,  presentation_order: 2 },
        { id: 'a3', component_type_id: 'ty1', is_primary: false, presentation_order: 3 },
      ],
    });
    await store.reload();
    await store.clearPrimaryForType('ty1');
    const cleared = h.api.update.mock.calls.filter(c => c[0] === 'type_attributes');
    expect(cleared.map(c => c[1]).sort()).toEqual(['a1', 'a2']);
    expect(cleared.every(c => c[2].is_primary === false)).toBe(true);
  });
});

// ── planActions ──────────────────────────────────────────────────────────────────
describe('planActions', () => {
  it('createPlan uploads the image then creates the plan with its URL', async () => {
    const file = { name: 'floor.png' };
    const plan = await store.createPlan({ building: 'Block A' }, file);
    expect(h.supabase.storage.from).toHaveBeenCalledWith('plan-images');
    const arg = h.api.create.mock.calls.find(c => c[0] === 'plans')[1];
    expect(arg).toMatchObject({ building: 'Block A', image_url: 'https://cdn/plan.png', created_by: 'u1' });
    expect(get(store).plans).toContainEqual(plan);
  });

  it('updatePlanScale writes the scale ref + aspect ratio', async () => {
    await loadCompsPlan([{ id: 'p1', building: 'A' }]);
    await store.updatePlanScale('p1', { x1: 0, y1: 0, x2: 1, y2: 1, metres: 5 }, 1.5);
    const arg = h.api.update.mock.calls.find(c => c[0] === 'plans')[2];
    expect(arg).toMatchObject({ image_aspect_ratio: 1.5, updated_by: 'u1' });
    expect(arg.scale_ref.metres).toBe(5);
  });

  it('replacePlanImage clears the old scale + aspect ratio', async () => {
    await loadCompsPlan([{ id: 'p1', building: 'A' }]);
    await store.replacePlanImage('p1', { name: 'new.png' });
    const arg = h.api.update.mock.calls.find(c => c[0] === 'plans')[2];
    expect(arg).toMatchObject({ image_url: 'https://cdn/plan.png', scale_ref: null, image_aspect_ratio: null });
  });

  it('deletePlan removes the plan components first, then the plan, and prunes state', async () => {
    h.setTables({ plans: [{ id: 'p1', building: 'A' }] });
    await store.load();
    await loadComps([{ id: 'c1', plan_id: 'p1' }, { id: 'c2', plan_id: 'other' }]);
    await store.deletePlan('p1');
    expect(h.api.deleteMany).toHaveBeenCalledWith('components', { plan_id: 'p1' });
    expect(h.api.delete).toHaveBeenCalledWith('plans', 'p1');
    const s = get(store);
    expect(s.plans).toHaveLength(0);
    expect(s.components.map(c => c.id)).toEqual(['c2']);     // only the non-plan component remains
  });

  it('copyPlan duplicates the source components onto a new plan and reports the count', async () => {
    h.setTables({
      plans:  [{ id: 'p1', building: 'A', floor_id: 'f1', image_url: 'img', name: 'Src' }],
      floors: [{ id: 'f1', short_name: 'L1' }, { id: 'f2', short_name: 'L2' }],
      components: [{ id: 'sc1', type_code: 'FD', asset_id: 'A1', floor_id: 'f1' }],
    });
    await store.load();
    const { plan, copied } = await store.copyPlan('p1', { name: 'Copy', floor_id: 'f2' });
    expect(copied).toBe(1);
    // a new component was created on the new plan, assigned to the new floor
    const compCreate = h.api.create.mock.calls.find(c => c[0] === 'components')[1];
    expect(compCreate).toMatchObject({ plan_id: plan.id, floor_id: 'f2', type_code: 'FD' });
  });
});

// Helper: seed plans into state via load (used by plan-update tests).
async function loadCompsPlan(plans) {
  h.setTables({ plans });
  await store.load();
}
