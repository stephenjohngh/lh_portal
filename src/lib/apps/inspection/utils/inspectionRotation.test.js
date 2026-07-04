// src/lib/apps/inspection/utils/inspectionRotation.test.js
import { describe, it, expect } from 'vitest';
import {
  deriveTriggerPool,
  deriveNextTrigger,
  resolveLinkedSet,
  buildRotatingWalk,
} from './inspectionRotation.js';

// Two walkable floors (G walks before F1) and one off-route floor.
const FLOORS = [
  { id: 'fG', short_name: 'G',  walk_order: 1 },
  { id: 'f1', short_name: '1',  walk_order: 2 },
  { id: 'fR', short_name: 'R',  walk_order: null },   // roof — not on the walk
];
const TYPES = [
  { id: 'T-cp',   code: 'call_point', initial: 'CP' },
  { id: 'T-bell', code: 'bell',       initial: 'B' },
  { id: 'T-lift', code: 'lift',       initial: 'L' },
];
const CTX = { types: TYPES, attrDefs: {}, componentAttrs: {}, inspections: {} };

const cp = (id, floor_id, asset_id, extra = {}) =>
  ({ id, type_code: 'call_point', floor_id, asset_id, ...extra });

const DEFINITION = {
  id: 'def-rot', name: 'Weekly call point', mode: 'rotating',
  scope: { typeCodes: ['call_point'] }, frequency_days: 7,
  link_source: 'component_links', link_type_filter: null,
};

describe('deriveTriggerPool', () => {
  it('scope-matches, excludes off-route floors and internal (order-0) components, orders by walk route', () => {
    const components = [
      cp('cp-f1', 'f1', '01'),
      cp('cp-g2', 'fG', '02'),
      cp('cp-g1', 'fG', '01'),
      cp('cp-roof', 'fR', '01'),                                // floor not walkable
      cp('cp-int', 'fG', '00', { inspection_sort_order: 0 }),   // internal
      { id: 'bell1', type_code: 'bell', floor_id: 'fG', asset_id: 'B1' }, // outside scope
    ];
    const pool = deriveTriggerPool(components, DEFINITION, CTX, FLOORS);
    expect(pool.map(c => c.id)).toEqual(['cp-g1', 'cp-g2', 'cp-f1']);
  });

  it('inspection_sort_order beats asset_id within a floor (nulls last)', () => {
    const components = [
      cp('a', 'fG', '01'),                                  // no sort order → last
      cp('b', 'fG', '99', { inspection_sort_order: 1 }),
      cp('c', 'fG', '50', { inspection_sort_order: 2 }),
    ];
    const pool = deriveTriggerPool(components, DEFINITION, CTX, FLOORS);
    expect(pool.map(c => c.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('deriveNextTrigger', () => {
  const pool = [cp('cp1', 'fG', '01'), cp('cp2', 'fG', '02'), cp('cp3', 'f1', '01')];

  it('never-tested comes first, in pool order', () => {
    const lastTested = { cp1: '2026-07-01T10:00:00Z' };
    expect(deriveNextTrigger(pool, lastTested)?.id).toBe('cp2');
  });

  it('all tested → the oldest last-test wins', () => {
    const lastTested = {
      cp1: '2026-06-20T10:00:00Z',
      cp2: '2026-06-01T10:00:00Z',   // oldest
      cp3: '2026-06-27T10:00:00Z',
    };
    expect(deriveNextTrigger(pool, lastTested)?.id).toBe('cp2');
  });

  it('exact ties fall to pool (walk) order', () => {
    const t = '2026-06-01T10:00:00Z';
    expect(deriveNextTrigger(pool, { cp1: t, cp2: t, cp3: t })?.id).toBe('cp1');
  });

  it('empty pool → null', () => {
    expect(deriveNextTrigger([], {})).toBeNull();
  });
});

describe('resolveLinkedSet', () => {
  const trigger = cp('cp1', 'fG', '01');
  const bell    = { id: 'bell1', type_code: 'bell', floor_id: 'fG', asset_id: 'B1' };
  const lift    = { id: 'lift1', type_code: 'lift', floor_id: 'f1', asset_id: 'L1',
                    inspection_sort_order: 0 };   // internal — still linkable
  const components = [trigger, bell, lift];
  const refCtx = { components, floors: FLOORS, types: TYPES };

  const links = {
    cp1: [
      { to_component_ref: 'G/B/B1',    link_type: 'fire_trigger' },
      { to_component_ref: '1/L/L1',    link_type: 'lift_ground' },
      { to_component_ref: 'G/B/GONE',  link_type: 'fire_trigger' },  // renamed/deleted
    ],
  };

  it('resolves the trigger\'s links (including walk-excluded components) and reports unresolved refs', () => {
    const { linked, unresolved } = resolveLinkedSet(trigger, DEFINITION, links, refCtx);
    expect(linked.map(c => c.id)).toEqual(['bell1', 'lift1']);
    expect(unresolved).toEqual(['G/B/GONE']);
  });

  it('link_type_filter restricts which links participate', () => {
    const def = { ...DEFINITION, link_type_filter: 'fire_trigger' };
    const { linked, unresolved } = resolveLinkedSet(trigger, def, links, refCtx);
    expect(linked.map(c => c.id)).toEqual(['bell1']);
    expect(unresolved).toEqual(['G/B/GONE']);
  });

  it('self_only ignores links entirely', () => {
    const def = { ...DEFINITION, link_source: 'self_only' };
    expect(resolveLinkedSet(trigger, def, links, refCtx)).toEqual({ linked: [], unresolved: [] });
  });

  it('a trigger with no links yields an empty linked set (visible gap, not an error)', () => {
    expect(resolveLinkedSet(trigger, DEFINITION, {}, refCtx)).toEqual({ linked: [], unresolved: [] });
  });

  it('deduplicates links resolving to the same component and never includes the trigger itself', () => {
    const dupLinks = { cp1: [
      { to_component_ref: 'G/B/B1' },
      { to_component_ref: 'G/B/B1' },
      { to_component_ref: 'G/CP/01' },   // the trigger's own ref
    ] };
    const { linked } = resolveLinkedSet(trigger, DEFINITION, dupLinks, refCtx);
    expect(linked.map(c => c.id)).toEqual(['bell1']);
  });
});

describe('buildRotatingWalk', () => {
  it('pins the trigger first, then the linked set', () => {
    const trigger = cp('cp1', 'fG', '01');
    const bell    = { id: 'bell1', type_code: 'bell', floor_id: 'fG', asset_id: 'B1' };
    const walk = buildRotatingWalk(DEFINITION, {
      components:     [trigger, bell],
      floors:         FLOORS,
      componentLinks: { cp1: [{ to_component_ref: 'G/B/B1' }] },
      ctx:            CTX,
      lastTested:     {},
    });
    expect(walk.trigger.id).toBe('cp1');
    expect(walk.walkComponents.map(c => c.id)).toEqual(['cp1', 'bell1']);
    expect(walk.unresolved).toEqual([]);
  });

  it('empty pool → no trigger, empty walk', () => {
    const walk = buildRotatingWalk(DEFINITION, {
      components: [], floors: FLOORS, componentLinks: {}, ctx: CTX,
    });
    expect(walk.trigger).toBeNull();
    expect(walk.walkComponents).toEqual([]);
  });
});
