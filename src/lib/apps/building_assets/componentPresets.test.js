// src/lib/apps/building_assets/componentPresets.test.js
//
// presetToState is the one reading of a saved preset; applying a preset and
// highlighting the active one both use it. The highlight used to keep its own,
// older copy, which ignored the space and attribute filters and three column
// toggles — so a preset carrying any of them read as ACTIVE while none of it
// was applied (2026-10-03).

import { describe, it, expect, vi } from 'vitest';

vi.mock('#lib/utils/api.js', () => ({ api: {} }));
const { presetToState, configMatches } = await import('./componentPresets.js');

/** What the tab reports as its current config right after applying `preset`. */
const applied = (preset) => {
  const s = presetToState(preset);
  return { filters: { ...s.filters }, columns: { ...s.columns }, report: { ...s.report } };
};

const SHAPES = {
  'today’s shape': {
    filters: { floorPreset: 'custom', filterFloorIds: ['f1', 'f2'], filterSystemIds: ['s1'], filterTypeCodes: ['door_fire_door'],
               filterStatuses: ['failed'], filterSpaceIds: ['sp1'], filterTypes: ['st1'], filterKinds: ['room'],
               searchQuery: 'lobby', fixedAttrFilters: [{ defName: 'Rating', op: 'eq', values: ['FD30'] }],
               conditionAttrFilters: [] },
    columns: { showNotes: true, showLinked: false, showInspectionNotes: true, showAttributes: false,
               showConditions: true, showSpaces: true, view: 'grouped' },
    report:  { includePlan: true, includeList: false, includeFloorSummary: true, includeFullSummary: true,
               includeFullComponentList: false, planShowId: false, planShowLabel: true },
  },
  'single values, before multi-select': {
    filters: { floorPreset: 'single', filterFloorId: 'f1', filterSystemId: 's1', filterTypeCode: 'door_fire_door', filterStatus: 'ok' },
    columns: { showNotes: true, showLinked: true, showInspectionNotes: false },
  },
  'nothing but the oldest fields': { filters: {}, columns: {} },
};

describe('presetToState — every shape a preset has been saved in', () => {
  it('reads single values as one-item lists, and a "single" floor preset as a custom set', () => {
    const { filters } = presetToState(SHAPES['single values, before multi-select']);
    expect(filters).toMatchObject({
      floorPreset: 'custom', filterFloorIds: ['f1'], filterSystemIds: ['s1'],
      filterTypeCodes: ['door_fire_door'], filterStatuses: ['ok'],
    });
  });

  it('a "single" floor preset with no floor reads as every floor', () => {
    expect(presetToState({ filters: { floorPreset: 'single' } }).filters.floorPreset).toBe('all');
  });

  it('gives fields added since their defaults', () => {
    const s = presetToState(SHAPES['nothing but the oldest fields']);
    expect(s.filters).toMatchObject({ floorPreset: 'all', searchQuery: '', filterSpaceIds: [], filterTypes: [],
                                      filterKinds: [], fixedAttrFilters: [], conditionAttrFilters: [] });
    expect(s.columns).toMatchObject({ showAttributes: true, showConditions: true, showSpaces: false, view: 'list' });
    expect(s.report).toEqual({ includePlan: false, includeList: true, includeFloorSummary: true, includeFullSummary: false,
                               includeFullComponentList: false, planShowId: true, planShowLabel: false });
  });

  it('copes with no preset at all', () => {
    expect(presetToState(undefined).filters.floorPreset).toBe('all');
  });
});

describe('configMatches — is this preset what the tab shows?', () => {
  for (const [name, preset] of Object.entries(SHAPES)) {
    it(`a preset just applied reads as active (${name})`, () => {
      expect(configMatches(preset, applied(preset))).toBe(true);
    });
  }

  it('the order of ids does not matter', () => {
    const p = SHAPES['today’s shape'];
    const c = applied(p);
    c.filters.filterFloorIds = ['f2', 'f1'];
    expect(configMatches(p, c)).toBe(true);
  });

  // Each of these is a difference the old highlight could not see.
  const DIFFERENCES = {
    'a space filter':       (c) => { c.filters.filterSpaceIds = []; },
    'a space type filter':  (c) => { c.filters.filterTypes = []; },
    'a space kind filter':  (c) => { c.filters.filterKinds = []; },
    'an attribute filter':  (c) => { c.filters.fixedAttrFilters = []; },
    'a condition filter':   (c) => { c.filters.conditionAttrFilters = [{ defName: 'Closer', values: ['false'] }]; },
    'the attributes column':(c) => { c.columns.showAttributes = true; },
    'the conditions column':(c) => { c.columns.showConditions = false; },
    'the spaces column':    (c) => { c.columns.showSpaces = false; },
    // and these it always could
    'a floor':              (c) => { c.filters.filterFloorIds = ['f1']; },
    'the search':           (c) => { c.filters.searchQuery = ''; },
    'a report option':      (c) => { c.report.includePlan = false; },
  };
  for (const [what, change] of Object.entries(DIFFERENCES)) {
    it(`is NOT active when ${what} differs`, () => {
      const p = SHAPES['today’s shape'];
      const c = applied(p);
      change(c);
      expect(configMatches(p, c)).toBe(false);
    });
  }

  it('nothing is active before the tab has a config', () => {
    expect(configMatches(SHAPES['today’s shape'], null)).toBe(false);
  });
});
