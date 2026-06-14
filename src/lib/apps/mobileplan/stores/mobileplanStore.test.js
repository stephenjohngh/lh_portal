// src/lib/apps/mobileplan/stores/mobileplanStore.test.js
// CHARACTERIZATION tests for the read-only mobileplanStore. Pins: load() builds
// the hierarchy and auto-selects a floor; selectFloor() loads that floor's
// components/inspections/attrs; offline cache fallback kicks in when the network
// fails; setFilter persists to localStorage. Seams mocked: api, logger,
// localStorage (a working Map-backed stub so the cache paths run for real).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Map-backed localStorage stub (the store reads/writes cache + filter here).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const h = vi.hoisted(() => {
  let tables = {};
  let failFloors = false;   // make components fetch reject (offline test)
  // Canonical api.get behaviour — re-applied in beforeEach because
  // vi.clearAllMocks() does NOT reset mockImplementation, so any test that
  // overrides it would otherwise leak into later tests.
  const defaultGet = (table) => {
    if (failFloors && table === 'components') return Promise.reject(new Error('offline'));
    return Promise.resolve(tables[table] ?? []);
  };
  const api = {
    get: vi.fn(defaultGet),
    getAllIn: vi.fn((table) => Promise.resolve(tables[table] ?? [])),
    latestInspections: vi.fn(() => Promise.resolve(tables.__inspections ?? [])),
  };
  return { api, defaultGet, setTables: (t) => { tables = t; }, setFailFloors: (v) => { failFloors = v; } };
});

vi.mock('$lib/utils/api',    () => ({ api: h.api }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { mobileplanStore } = await import('./mobileplanStore.js');

const FIXTURE = {
  facilities:      [{ id: 'fac1', name: 'Lonsdale House' }],
  floors:          [{ id: 'f1', name: 'Ground', level_order: 1 }, { id: 'f2', name: 'First', level_order: 2 }],
  building_systems:[{ id: 'sys1', presentation_order: 1 }],
  component_types: [{ id: 'ty1', code: 'fd', presentation_order: 1 }],
  type_attributes: [{ id: 'at1', component_type_id: 'ty1', name: 'Fire rating', display_type: 'text', presentation_order: 1 }],
  plans:           [{ id: 'p1', floor_id: 'f1', image_url: 'img' }],
  components:      [{ id: 'c1', floor_id: 'f1', type_code: 'fd', asset_id: 'A1', status: 'ok' }],
  spaces:          [],
  plan_annotations:[],
  component_attributes: [{ id: 'ca1', component_id: 'c1', type_attribute_id: 'at1', value: 'FD30' }],
  __inspections:   [{ component_id: 'c1', inspection_result: 'ok' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  h.setFailFloors(false);
  h.setTables({ ...FIXTURE });
  h.api.get.mockImplementation(h.defaultGet);   // undo any per-test override
});

describe('load', () => {
  it('builds the hierarchy, picks the building, and auto-selects the first floor', async () => {
    await mobileplanStore.load();
    const s = get(mobileplanStore);
    expect(s.building.name).toBe('Lonsdale House');
    expect(s.floors).toHaveLength(2);
    expect(s.currentFloor.id).toBe('f1');         // first floor selected
    expect(s.currentPlan.id).toBe('p1');          // its plan resolved
    expect(s.loading).toBe(false);
    expect(s.usingCache).toBe(false);
  });

  it('falls back to the cached hierarchy when the network fails', async () => {
    await mobileplanStore.load();                 // warm the cache
    h.setFailFloors(false);
    // now break the hierarchy fetch and reload
    h.api.get.mockImplementation((table) => {
      if (table === 'facilities') return Promise.reject(new Error('offline'));
      return Promise.resolve(FIXTURE[table] ?? []);
    });
    await mobileplanStore.load();
    expect(get(mobileplanStore).usingCache).toBe(true);
  });
});

describe('selectFloor', () => {
  it('loads the floor components, inspections and enriched attributes', async () => {
    await mobileplanStore.load();                 // auto-selects f1
    const s = get(mobileplanStore);
    expect(s.components.map(c => c.id)).toEqual(['c1']);
    expect(s.inspections.c1.inspection_result).toBe('ok');
    // attrs enriched with attr_name from the type hierarchy
    expect(s.componentAttrs.c1[0]).toMatchObject({ attr_name: 'Fire rating', display_type: 'text', value: 'FD30' });
    expect(s.loadingFloor).toBe(false);
  });

  it('ignores an unknown floor id', async () => {
    await mobileplanStore.load();
    await mobileplanStore.selectFloor('does-not-exist');
    expect(get(mobileplanStore).currentFloor.id).toBe('f1'); // unchanged
  });

  it('falls back to cached floor data when the components fetch fails', async () => {
    await mobileplanStore.load();                 // caches f1 floor data
    h.setFailFloors(true);                        // break the network
    await mobileplanStore.selectFloor('f1', true); // force refresh → network fails → cache
    expect(get(mobileplanStore).usingCache).toBe(true);
    expect(get(mobileplanStore).components.map(c => c.id)).toEqual(['c1']);
  });
});

describe('setFilter / clearFilter', () => {
  it('persists hidden types/statuses to localStorage', async () => {
    mobileplanStore.setFilter({ hiddenTypes: new Set(['fd']), hiddenStatuses: new Set(['ok']) });
    const s = get(mobileplanStore);
    expect([...s.hiddenTypes]).toEqual(['fd']);
    const saved = JSON.parse(localStorage.getItem('mobileplan_filter'));
    expect(saved.hiddenTypes).toEqual(['fd']);
    expect(saved.hiddenStatuses).toEqual(['ok']);
  });

  it('clearFilter resets the sets and showSpaces', () => {
    mobileplanStore.setFilter({ hiddenTypes: new Set(['fd']), showSpaces: true });
    mobileplanStore.clearFilter();
    const s = get(mobileplanStore);
    expect([...s.hiddenTypes]).toEqual([]);
    expect(s.showSpaces).toBe(false);
  });
});

describe('ageLabel', () => {
  it('formats relative ages', () => {
    expect(mobileplanStore.ageLabel(30_000)).toBe('just now');
    expect(mobileplanStore.ageLabel(5 * 60_000)).toBe('5m ago');
    expect(mobileplanStore.ageLabel(3 * 3_600_000)).toBe('3h ago');
  });
});
