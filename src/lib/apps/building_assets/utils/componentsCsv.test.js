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
  it('neutralises formula-injection leads (= + - @) with a leading quote', () => {
    expect(csvEsc('=1+1')).toBe("'=1+1");
    expect(csvEsc('+cmd')).toBe("'+cmd");
    expect(csvEsc('-2+3')).toBe("'-2+3");
    expect(csvEsc('@SUM(A1)')).toBe("'@SUM(A1)");
    // still applies escaping after neutralising when the value also needs quoting
    expect(csvEsc('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
    // a normal value that merely contains a symbol later is untouched
    expect(csvEsc('a=b')).toBe('a=b');
  });
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
  it('orders by inspection_sort_order (nulls last) within a system — not by type', () => {
    // 'door' has the lower type presentation_order, but type is NOT a sort key:
    // the alarm wins because its inspection_sort_order is lower.
    const t = [
      { id: 't1', code: 'door',  name: 'Door',  building_system_id: 'sys1', presentation_order: 1 },
      { id: 't2', code: 'alarm', name: 'Alarm', building_system_id: 'sys1', presentation_order: 2 },
    ];
    const comps = [
      { type_code: 'door',  asset_id: 'D2', inspection_sort_order: 3 },
      { type_code: 'alarm', asset_id: 'A1', inspection_sort_order: 1 },
      { type_code: 'door',  asset_id: 'D1', inspection_sort_order: null }, // null → last, then asset_id
    ];
    expect(sortComponentsForCsv(comps, t, systems).map(c => c.asset_id)).toEqual(['A1', 'D2', 'D1']);
  });

  it('orders by system presentation_order first', () => {
    const sys = [
      { id: 's1', name: 'Zeta',  presentation_order: 1 },
      { id: 's2', name: 'Alpha', presentation_order: 2 },
    ];
    const t = [
      { id: 't1', code: 'z', name: 'Z', building_system_id: 's1' },
      { id: 't2', code: 'a', name: 'A', building_system_id: 's2' },
    ];
    const comps = [
      { type_code: 'a', asset_id: 'A1', inspection_sort_order: 1 },
      { type_code: 'z', asset_id: 'Z1', inspection_sort_order: 1 },
    ];
    // Zeta system (order 1) first despite 'Alpha' < 'Zeta' alphabetically.
    expect(sortComponentsForCsv(comps, t, sys).map(c => c.asset_id)).toEqual(['Z1', 'A1']);
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

