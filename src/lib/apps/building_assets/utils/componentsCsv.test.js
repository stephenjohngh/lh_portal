// src/lib/apps/building_assets/utils/componentsCsv.test.js
// Type-1 tests pinning the Components-tab CSV/export output exactly — this is
// silent-bug-prone data→string logic, so the assertions check whole rows.

import { describe, it, expect } from 'vitest';
import {
  csvEsc, resolveFixedAttrs, sortComponentsForCsv,
  buildInventoryCsvRows, buildConditionAuditCsvRows,
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

describe('buildInventoryCsvRows', () => {
  it('emits the header and a fully-populated data row', () => {
    const rows = buildInventoryCsvRows(filteredByFloor, {
      types, systems, attrDefs, componentAttrs, componentLinks, inspections,
      showLinked: true, showNotes: true, showInspectionNotes: true,
    });
    expect(rows[0]).toBe('Floor,System,Type,Asset ID,Label,Attributes,Linked,Notes,Insp. Notes,Last Inspected,Condition (last),Status');
    expect(rows[1]).toBe('G,Fire,Door,D1,Main,Fire rating: FD30,D2,a note,looks fine,2026-02-23,Gap OK: ✓,ok');
  });

  it('omits optional columns when their flags are off', () => {
    const rows = buildInventoryCsvRows(filteredByFloor, {
      types, systems, attrDefs, componentAttrs, componentLinks, inspections,
      showLinked: false, showNotes: false, showInspectionNotes: false,
    });
    expect(rows[0]).toBe('Floor,System,Type,Asset ID,Label,Attributes,Last Inspected,Condition (last),Status');
    expect(rows[1]).toBe('G,Fire,Door,D1,Main,Fire rating: FD30,2026-02-23,Gap OK: ✓,ok');
  });

  it('blanks the date but still lists applicable conditions as — when never inspected', () => {
    const rows = buildInventoryCsvRows(filteredByFloor, {
      types, systems, attrDefs, componentAttrs, componentLinks, inspections: {},
      showLinked: false, showNotes: false, showInspectionNotes: false,
    });
    // Last Inspected blank; the type's condition attr still shows, unrecorded (—)
    expect(rows[1]).toBe('G,Fire,Door,D1,Main,Fire rating: FD30,,Gap OK: —,ok');
  });
});

describe('buildConditionAuditCsvRows', () => {
  it('unpivots condition attributes into one column each', () => {
    const out = buildConditionAuditCsvRows([comp], filteredByFloor, { types, systems, attrDefs, inspections });
    expect(out.error).toBeUndefined();
    expect(out.rows[0]).toBe('Floor,System,Type,Asset ID,Label,Last Inspected,Overall,Gap OK');
    expect(out.rows[1]).toBe('G,Fire,Door,D1,Main,2026-02-23,ok,✓');
  });

  it('marks failed/unrecorded correctly (✗ / —)', () => {
    const failed = { c1: { ...inspections.c1, checklist_results: { a2: false } } };
    expect(buildConditionAuditCsvRows([comp], filteredByFloor, { types, systems, attrDefs, inspections: failed })
      .rows[1].endsWith(',✗')).toBe(true);
    expect(buildConditionAuditCsvRows([comp], filteredByFloor, { types, systems, attrDefs, inspections: {} })
      .rows[1].endsWith(',—')).toBe(true); // applies to type but no recorded value
  });

  it('returns an error (no rows) when no condition attributes apply', () => {
    const fixedOnly = { t1: [{ id: 'a1', name: 'Fire rating', checkable: false, visible: true }] };
    const out = buildConditionAuditCsvRows([comp], filteredByFloor, { types, systems, attrDefs: fixedOnly, inspections });
    expect(out.rows).toBeUndefined();
    expect(out.error).toMatch(/no condition attributes/i);
  });
});
