// src/lib/apps/building_assets/utils/attrFilters.test.js
// The Components-tab Fixed/Condition attribute filters. The interesting parts
// are the value-source branching (fixed → componentAttrs; condition →
// inspection checklist) and the two "unset" special cases documented in
// docs/_design_fixed_condition_attributes.md.

import { describe, it, expect } from 'vitest';
import {
  matchesAttrFilter, matchesAllAttrFilters, lookupAttrValue, defaultFilterFor,
  findFilterDef,
} from './attrFilters.js';

const comp = { id: 'c1' };

// A fixed dropdown def, a fixed checkbox def, and a condition (checkable) checkbox def.
const fixedDropdown = { id: 'd1', checkable: false, display_type: 'dropdown' };
const fixedCheckbox = { id: 'd2', checkable: false, display_type: 'checkbox' };
const condCheckbox  = { id: 'd3', checkable: true,  display_type: 'checkbox' };
const fixedNumber   = { id: 'd4', checkable: false, display_type: 'number' };
const fixedText     = { id: 'd5', checkable: false, display_type: 'text' };
const defs = [fixedDropdown, fixedCheckbox, condCheckbox, fixedNumber, fixedText];

// Helpers to build the value sources.
const attrs = (pairs) => ({ c1: Object.entries(pairs).map(([type_attribute_id, value]) => ({ type_attribute_id, value })) });
const insp  = (checklist) => ({ c1: { checklist_results: checklist } });

describe('lookupAttrValue', () => {
  it('reads fixed values from componentAttrs', () => {
    expect(lookupAttrValue(fixedDropdown, 'c1', attrs({ d1: 'Mechanical' }), {})).toBe('Mechanical');
  });
  it('reads condition values from the latest inspection checklist', () => {
    expect(lookupAttrValue(condCheckbox, 'c1', {}, insp({ d3: true }))).toBe(true);
  });
  it('returns null for a condition attr when the component was never inspected', () => {
    expect(lookupAttrValue(condCheckbox, 'c1', {}, {})).toBeNull();
  });
});

describe('matchesAttrFilter — operators', () => {
  it("'in' matches when the stored value is in the set", () => {
    const f = { defId: 'd1', op: 'in', values: ['Mechanical', 'Electrical'] };
    expect(matchesAttrFilter(comp, defs, attrs({ d1: 'Mechanical' }), {}, f)).toBe(true);
    expect(matchesAttrFilter(comp, defs, attrs({ d1: 'Plumbing' }), {}, f)).toBe(false);
  });

  it('numeric comparators coerce the stored text', () => {
    const a = attrs({ d4: '30' });
    expect(matchesAttrFilter(comp, defs, a, {}, { defId: 'd4', op: 'gte', values: 30 })).toBe(true);
    expect(matchesAttrFilter(comp, defs, a, {}, { defId: 'd4', op: 'lt',  values: 30 })).toBe(false);
  });

  it('text comparators are case-insensitive', () => {
    const a = attrs({ d5: 'Front Entrance' });
    expect(matchesAttrFilter(comp, defs, a, {}, { defId: 'd5', op: 'contains', values: 'entrance' })).toBe(true);
    expect(matchesAttrFilter(comp, defs, a, {}, { defId: 'd5', op: 'starts',   values: 'front' })).toBe(true);
  });

  it("condition 'is_false' matches a failed checklist result", () => {
    expect(matchesAttrFilter(comp, defs, {}, insp({ d3: false }), { defId: 'd3', op: 'is_false' })).toBe(true);
    expect(matchesAttrFilter(comp, defs, {}, insp({ d3: true }),  { defId: 'd3', op: 'is_false' })).toBe(false);
  });
});

describe('matchesAttrFilter — unset special cases', () => {
  it("an 'in' filter that includes an empty-equivalent value also matches unset components", () => {
    // dropdown [Mechanical, None] picking None must match a door with no value at all
    const f = { defId: 'd1', op: 'in', values: ['Mechanical', 'None'] };
    expect(matchesAttrFilter(comp, defs, {}, {}, f)).toBe(true);
  });

  it("a fixed checkbox with no stored value matches 'is_false' (UI shows it as 'No')", () => {
    expect(matchesAttrFilter(comp, defs, {}, {}, { defId: 'd2', op: 'is_false' })).toBe(true);
  });

  it("a condition checkbox with no inspection does NOT match 'is_false' (uninspected ≠ failed)", () => {
    expect(matchesAttrFilter(comp, defs, {}, {}, { defId: 'd3', op: 'is_false' })).toBe(false);
  });

  it('respects includeUnset for an unset value otherwise', () => {
    const base = { defId: 'd5', op: 'contains', values: 'x' };
    expect(matchesAttrFilter(comp, defs, {}, {}, { ...base, includeUnset: true })).toBe(true);
    expect(matchesAttrFilter(comp, defs, {}, {}, { ...base, includeUnset: false })).toBe(false);
  });

  it('a filter whose attr is not defined on the type falls back to includeUnset', () => {
    const f = { defId: 'unknown', op: 'in', values: ['x'], includeUnset: false };
    expect(matchesAttrFilter(comp, defs, {}, {}, f)).toBe(false);
  });
});

describe('matchesAllAttrFilters', () => {
  it('ANDs filters — all must pass', () => {
    const a = attrs({ d1: 'Mechanical', d4: '30' });
    const pass = [{ defId: 'd1', op: 'in', values: ['Mechanical'] }, { defId: 'd4', op: 'gte', values: 30 }];
    const fail = [{ defId: 'd1', op: 'in', values: ['Mechanical'] }, { defId: 'd4', op: 'gt',  values: 30 }];
    expect(matchesAllAttrFilters(comp, defs, a, {}, pass)).toBe(true);
    expect(matchesAllAttrFilters(comp, defs, a, {}, fail)).toBe(false);
  });
});

describe('findFilterDef / defName matching (inspection definitions, cross-type)', () => {
  // Same attribute NAME owned by two different types → two def rows with
  // distinct ids. A definition scope must match either via the name.
  const emgA = { id: 'e1', name: 'Emergency', checkable: false, display_type: 'checkbox' };
  const emgB = { id: 'e2', name: 'Emergency', checkable: false, display_type: 'checkbox' };
  const emgCond = { id: 'e3', name: 'Emergency', checkable: true, display_type: 'checkbox' };

  it('resolves by defId when present', () => {
    expect(findFilterDef([emgA], { defId: 'e1' })).toBe(emgA);
  });

  it('resolves by defName across differing def ids', () => {
    expect(findFilterDef([emgA], { defName: 'Emergency', checkable: false })).toBe(emgA);
    expect(findFilterDef([emgB], { defName: 'Emergency', checkable: false })).toBe(emgB);
  });

  it('checkable class disambiguates same-named fixed vs condition defs', () => {
    expect(findFilterDef([emgCond], { defName: 'Emergency', checkable: false })).toBeUndefined();
    expect(findFilterDef([emgCond], { defName: 'Emergency', checkable: true })).toBe(emgCond);
  });

  it('a defName is_true filter matches the emergency component on either type', () => {
    const f = { defName: 'Emergency', checkable: false, op: 'is_true', values: '' };
    // component of type A, Emergency=true
    expect(matchesAttrFilter(comp, [emgA], attrs({ e1: 'true' }), {}, f)).toBe(true);
    // component of type B, Emergency=true
    expect(matchesAttrFilter(comp, [emgB], attrs({ e2: 'true' }), {}, f)).toBe(true);
    // component of type A, Emergency unset (fixed checkbox unset → treated "No")
    expect(matchesAttrFilter(comp, [emgA], {}, {}, f)).toBe(false);
  });
});

describe('defaultFilterFor', () => {
  it('condition checkbox defaults to is_false (find failures)', () => {
    expect(defaultFilterFor({ display_type: 'checkbox', checkable: true }).op).toBe('is_false');
  });
  it('fixed checkbox defaults to is_true', () => {
    expect(defaultFilterFor({ display_type: 'checkbox', checkable: false }).op).toBe('is_true');
  });
  it('dropdown/radio default to in with an empty array', () => {
    expect(defaultFilterFor({ display_type: 'dropdown' })).toMatchObject({ op: 'in', values: [] });
  });
  it('text defaults to contains', () => {
    expect(defaultFilterFor({ display_type: 'text' }).op).toBe('contains');
  });
});
