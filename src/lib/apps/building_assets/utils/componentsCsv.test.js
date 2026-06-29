// src/lib/apps/building_assets/utils/componentsCsv.test.js
// Type-1 tests pinning the Components-tab CSV/export output exactly — this is
// silent-bug-prone data→string logic, so the assertions check whole rows.

import { describe, it, expect } from 'vitest';
import {
  csvEsc, resolveFixedAttrs, sortComponentsForCsv, fixedAttrValuesByDef,
} from './componentsCsv.js';

// ── Shared fixture ───────────────────────────────────────────────────────────
const types = [{ id: 't1', code: 'door', name: 'Door', building_system_id: 'sys1' }];
const systems = [{ id: 'sys1', name: 'Fire', presentation_order: 1 }];
const attrDefs = {
  t1: [
    { id: 'a1', name: 'Fire rating', checkable: false, visible: true, display_type: 'text' },
    { id: 'a2', name: 'Gap OK',      checkable: true,  visible: true },
  ],
};
const componentAttrs = { c1: [{ type_attribute_id: 'a1', value: 'FD30' }] };
const inspections = {
  c1: {
    inspected_at: '2026-02-23T10:00:00Z',
    inspection_result: 'ok',
    inspector_notes: 'looks fine',
    checklist_results: { a2: true },
  },
};
const componentLinks = { c1: [{ to_component_ref: 'D2' }] };
const comp = { id: 'c1', type_code: 'door', asset_id: 'D1', label: 'Main', notes: 'a note', status: 'ok', floor_id: 'f1' };
const filteredByFloor = [{ floor: { short_name: 'G' }, components: [comp] }];

describe('csvEsc', () => {
  it('leaves plain values untouched', () => expect(csvEsc('hello')).toBe('hello'));
  it('quotes values with commas', () => expect(csvEsc('a,b')).toBe('"a,b"'));
  it('doubles and quotes embedded quotes', () => expect(csvEsc('say "hi"')).toBe('"say ""hi"""'));
  it('quotes newlines', () => expect(csvEsc('a\nb')).toBe('"a\nb"'));
  it('renders null/undefined as empty', () => { expect(csvEsc(null)).toBe(''); expect(csvEsc(undefined)).toBe(''); });
});

describe('resolveFixedAttrs', () => {
  it('returns visible fixed attrs (excludes condition/checkable defs)', () => {
    expect(resolveFixedAttrs(comp, types, attrDefs, componentAttrs))
      .toEqual([{ name: 'Fire rating', value: 'FD30', display_type: 'text' }]);
  });
  it('drops empty-equivalent values (None/No/Unknown/blank)', () => {
    const ca = { c1: [{ type_attribute_id: 'a1', value: 'None' }] };
    expect(resolveFixedAttrs(comp, types, attrDefs, ca)).toEqual([]);
  });
  it('maps a ticked checkbox to "Yes" and drops an unticked one', () => {
    const defs = { t1: [{ id: 'a1', name: 'Self closing', checkable: false, visible: true, display_type: 'checkbox' }] };
    expect(resolveFixedAttrs(comp, types, defs, { c1: [{ type_attribute_id: 'a1', value: 'true' }] }))
      .toEqual([{ name: 'Self closing', value: 'Yes', display_type: 'checkbox' }]);
    expect(resolveFixedAttrs(comp, types, defs, { c1: [{ type_attribute_id: 'a1', value: 'false' }] })).toEqual([]);
  });
  it('returns [] for an unknown type', () => {
    expect(resolveFixedAttrs({ ...comp, type_code: 'nope' }, types, attrDefs, componentAttrs)).toEqual([]);
  });
});

describe('sortComponentsForCsv', () => {
  it('orders by system → type → numeric asset id', () => {
    const t = [
      { id: 't1', code: 'door',  name: 'Door',  building_system_id: 'sys1' },
      { id: 't2', code: 'alarm', name: 'Alarm', building_system_id: 'sys1' },
    ];
    const comps = [
      { type_code: 'door',  asset_id: 'D10' },
      { type_code: 'door',  asset_id: 'D2'  },
      { type_code: 'alarm', asset_id: 'A1'  },
    ];
    expect(sortComponentsForCsv(comps, t, systems).map(c => c.asset_id)).toEqual(['A1', 'D2', 'D10']);
  });
});

describe('fixedAttrValuesByDef', () => {
  it('keys resolved fixed values by def id (drops condition + empty-equivalent)', () => {
    expect(fixedAttrValuesByDef(comp, types, attrDefs, componentAttrs)).toEqual({ a1: 'FD30' });
  });
  it('returns {} for an unknown type', () => {
    expect(fixedAttrValuesByDef({ ...comp, type_code: 'nope' }, types, attrDefs, componentAttrs)).toEqual({});
  });
});

