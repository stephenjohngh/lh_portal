// src/lib/apps/building_assets/lookups.test.js
//
// Pure-logic tests for the inspection display helpers in lookups.js — the two
// siblings that split one inspection's condition attributes into the pass/fail
// chips and the measured readings (G2, migration 169).
//
// The split matters: the walk records a text/number condition attribute in
// component_inspections.readings and a boolean one in checklist_results, never
// both. If these helpers disagreed with that split, a reading would render as a
// permanently "not recorded" grey dash — which is exactly what happened before
// G2 and what the isReadingDef exclusion fixes.

import { describe, it, expect } from 'vitest';
import { isReadingDef, conditionChecklistDisplay, readingsDisplay } from './lookups.js';

// One type's effective attribute set: two pass/fail checks, two readings, plus
// a fixed (non-checkable) attr and a hidden one that must never be displayed.
const DEFS = [
  { id: 'a-gap',      name: 'Door gap',              checkable: true,  visible: true,  display_type: 'boolean' },
  { id: 'a-closer',   name: 'Closer working',        checkable: true,  visible: true,  display_type: 'checkbox' },
  { id: 'a-duration', name: 'Duration achieved (min)', checkable: true, visible: true, display_type: 'number' },
  { id: 'a-note',     name: 'Test observation',      checkable: true,  visible: true,  display_type: 'text' },
  { id: 'a-rating',   name: 'Fire rating',           checkable: false, visible: true,  display_type: 'text' },
  { id: 'a-hidden',   name: 'Hidden reading',        checkable: true,  visible: false, display_type: 'number' },
];

describe('isReadingDef', () => {
  it('is true only for text/number attributes', () => {
    expect(isReadingDef({ display_type: 'number' })).toBe(true);
    expect(isReadingDef({ display_type: 'text' })).toBe(true);
    expect(isReadingDef({ display_type: 'boolean' })).toBe(false);
    expect(isReadingDef(null)).toBe(false);
    expect(isReadingDef(undefined)).toBe(false);
  });
});

describe('conditionChecklistDisplay', () => {
  it('covers only the visible pass/fail checks — readings are excluded', () => {
    const insp = { checklist_results: { 'a-gap': true, 'a-closer': false } };
    expect(conditionChecklistDisplay(insp, DEFS)).toEqual([
      { def: DEFS[0], passed: true },
      { def: DEFS[1], passed: false },
    ]);
  });

  it('a reading attribute never appears as a "not recorded" dash', () => {
    // Before G2 these rendered as grey "—" chips on every surface, because a
    // text/number attr is checkable but is never a boolean in checklist_results.
    const names = conditionChecklistDisplay({ checklist_results: {} }, DEFS).map(i => i.def.name);
    expect(names).not.toContain('Duration achieved (min)');
    expect(names).not.toContain('Test observation');
  });

  it('still reports a genuinely unrecorded check as null', () => {
    const items = conditionChecklistDisplay({ checklist_results: { 'a-gap': true } }, DEFS);
    expect(items.find(i => i.def.id === 'a-closer').passed).toBeNull();
  });

  it('tolerates a null inspection and null defs', () => {
    expect(conditionChecklistDisplay(null, DEFS).every(i => i.passed === null)).toBe(true);
    expect(conditionChecklistDisplay(null, null)).toEqual([]);
  });
});

describe('readingsDisplay', () => {
  it('returns the recorded readings, keyed by attribute id, preserving def order', () => {
    const insp = { readings: { 'a-note': 'lamp flickered', 'a-duration': 180 } };
    expect(readingsDisplay(insp, DEFS)).toEqual([
      { def: DEFS[2], value: 180 },
      { def: DEFS[3], value: 'lamp flickered' },
    ]);
  });

  it('omits readings that were not recorded rather than showing a dash', () => {
    // A pre-migration-169 inspection has readings={} but its values live as
    // prose in inspector_notes — a "—" would falsely claim the test was skipped.
    expect(readingsDisplay({ readings: {} }, DEFS)).toEqual([]);
    expect(readingsDisplay({}, DEFS)).toEqual([]);
    expect(readingsDisplay(null, DEFS)).toEqual([]);
  });

  it('treats an empty string as not recorded, but keeps zero', () => {
    const insp = { readings: { 'a-note': '', 'a-duration': 0 } };
    // 0 lux / 0 minutes is a real (and alarming) measurement, not an absence.
    expect(readingsDisplay(insp, DEFS)).toEqual([{ def: DEFS[2], value: 0 }]);
  });

  it('never surfaces a hidden or non-checkable attribute', () => {
    const insp = { readings: { 'a-hidden': 42, 'a-rating': 'FD30' } };
    expect(readingsDisplay(insp, DEFS)).toEqual([]);
  });
});
