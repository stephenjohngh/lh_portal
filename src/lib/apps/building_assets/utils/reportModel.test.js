// src/lib/apps/building_assets/utils/reportModel.test.js
// Type-1 tests for the shared report data model — the detail matrix (CSV + XLSX),
// the CSV serialiser, and the status pivot (DOCX + XLSX summaries).

import { describe, it, expect } from 'vitest';
import { buildComponentsMatrix, buildComponentsCsvRows, buildStatusPivot } from './reportModel.js';

// ── Shared fixture (mirrors componentsCsv.test fixture) ──────────────────────
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
  c1: { inspected_at: '2026-02-23T10:00:00Z', inspection_result: 'ok', inspector_notes: 'looks fine', checklist_results: { a2: true } },
};
const componentLinks = { c1: [{ to_component_ref: 'D2' }] };
const comp = { id: 'c1', type_code: 'door', asset_id: 'D1', label: 'Main', notes: 'a note', status: 'ok', floor_id: 'f1' };
const filteredByFloor = [{ floor: { short_name: 'G' }, components: [comp] }];

const allOn = { showLinked: true, showNotes: true, showInspectionNotes: true, showAttributes: true, showConditions: true };
const ctx = (over) => ({ types, systems, attrDefs, componentAttrs, componentLinks, inspections, ...allOn, ...over });

describe('buildComponentsMatrix', () => {
  it('all columns on — fixed attr + condition attr each get their own column', () => {
    const { headers, rows } = buildComponentsMatrix([comp], filteredByFloor, ctx());
    expect(headers).toEqual(['Floor', 'System', 'Type', 'Asset ID', 'Label', 'Linked', 'Notes', 'Insp. Notes', 'Last Inspected', 'Fire rating', 'Gap OK', 'Status']);
    expect(rows[0]).toEqual(['G', 'Fire', 'Door', 'D1', 'Main', 'D2', 'a note', 'looks fine', '2026-02-23', 'FD30', '✓', 'ok']);
  });

  it('drops per-attribute / per-condition columns when their flags are off', () => {
    const base = { showLinked: false, showNotes: false, showInspectionNotes: false };
    expect(buildComponentsMatrix([comp], filteredByFloor, ctx({ ...base, showAttributes: false })).headers)
      .toEqual(['Floor', 'System', 'Type', 'Asset ID', 'Label', 'Last Inspected', 'Gap OK', 'Status']);
    expect(buildComponentsMatrix([comp], filteredByFloor, ctx({ ...base, showConditions: false })).headers)
      .toEqual(['Floor', 'System', 'Type', 'Asset ID', 'Label', 'Last Inspected', 'Fire rating', 'Status']);
  });

  it('condition cell is ✗ for fail and — for applies-but-never-inspected', () => {
    const base = { showLinked: false, showNotes: false, showInspectionNotes: false, showAttributes: false };
    const failed = { c1: { ...inspections.c1, checklist_results: { a2: false } } };
    expect(buildComponentsMatrix([comp], filteredByFloor, ctx({ ...base, inspections: failed })).rows[0])
      .toEqual(['G', 'Fire', 'Door', 'D1', 'Main', '2026-02-23', '✗', 'ok']);
    expect(buildComponentsMatrix([comp], filteredByFloor, ctx({ ...base, inspections: {} })).rows[0])
      .toEqual(['G', 'Fire', 'Door', 'D1', 'Main', '', '—', 'ok']);
  });
});

describe('buildComponentsCsvRows', () => {
  it('serialises the matrix to RFC-4180 lines', () => {
    const rows = buildComponentsCsvRows([comp], filteredByFloor, ctx());
    expect(rows[0]).toBe('Floor,System,Type,Asset ID,Label,Linked,Notes,Insp. Notes,Last Inspected,Fire rating,Gap OK,Status');
    expect(rows[1]).toBe('G,Fire,Door,D1,Main,D2,a note,looks fine,2026-02-23,FD30,✓,ok');
  });
  it('escapes cells containing commas', () => {
    const withComma = { c1: [{ type_attribute_id: 'a1', value: 'FD30, intumescent' }] };
    const rows = buildComponentsCsvRows([comp], filteredByFloor, ctx({ componentAttrs: withComma }));
    expect(rows[1]).toContain('"FD30, intumescent"');
  });
  it('emits header only when there are no components', () => {
    expect(buildComponentsCsvRows([], [], ctx())).toHaveLength(1);
  });
});

describe('buildStatusPivot', () => {
  it('counts statuses per System × Type with totals', () => {
    const { pivot, totals } = buildStatusPivot([
      { system_name: 'Fire', type_name: 'Door', status: 'ok' },
      { system_name: 'Fire', type_name: 'Door', status: 'failed' },
      { system_name: 'Fire', type_name: 'Alarm', status: 'ok' },
      { system_name: 'Water', type_name: 'Valve', status: 'problem' },
    ]);
    expect(pivot).toHaveLength(3);
    const door = pivot.find(r => r.type_name === 'Door');
    expect(door).toMatchObject({ system_name: 'Fire', ok: 1, failed: 1, problem: 0, inactive: 0, total: 2 });
    expect(totals).toEqual({ ok: 2, problem: 1, failed: 1, inactive: 0, total: 4 });
  });
  it('sorts by system then type and falls back for missing names', () => {
    const { pivot } = buildStatusPivot([
      { type_code: 'x', status: 'ok' },                        // no system/type names
      { system_name: 'Fire', type_name: 'Door', status: 'ok' },
    ]);
    expect(pivot[0].system_name).toBe('Fire');                 // 'Fire' < 'Other'
    expect(pivot[1]).toMatchObject({ system_name: 'Other', type_name: 'x' });
  });
  it('ignores unknown status values', () => {
    const { totals } = buildStatusPivot([{ system_name: 'S', type_name: 'T', status: 'weird' }]);
    expect(totals.total).toBe(0);
  });
});
