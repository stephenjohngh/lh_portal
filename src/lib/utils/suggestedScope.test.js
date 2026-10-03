// src/lib/utils/suggestedScope.test.js
//
// A register entry's suggestedScope is copied into the planned obligation the
// app creates from it, and the walk then covers whatever that scope matches.
// ⛔ Emergency lighting's suggested scope was written {name, value}, a shape the
// matcher does not read — and a filter it cannot read matches NOTHING. Switched
// on, "Emergency lighting — monthly function test" would have walked zero of the
// 105 emergency luminaires (found 2026-10-03, while it was still switched off).
// So every suggested scope is checked against the matcher itself, not against a
// description of it.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE } from './statutoryTemplate.js';
import { matchesAttrFilter } from '$lib/apps/building_assets/utils/attrFilters.js';

const SCOPE_KEYS = new Set(['typeCodes', 'systemIds', 'floorIds', 'statuses', 'fixedAttrFilters', 'conditionAttrFilters']);
const OPS = new Set(['in', 'is_true', 'is_false', 'lt', 'lte', 'eq', 'gte', 'gt', 'contains', 'starts', 'eq_text']);

const scoped = STATUTORY_TEMPLATE.filter(e => e.suggestedScope);
const attrFilters = scoped.flatMap(e => [
  ...(e.suggestedScope.fixedAttrFilters ?? []).map(f => ({ key: e.key, f, checkable: false })),
  ...(e.suggestedScope.conditionAttrFilters ?? []).map(f => ({ key: e.key, f, checkable: true })),
]);

describe('every scope the register suggests is one the matcher reads', () => {
  it('finds the scopes it exists for', () => {
    expect(scoped.length).toBeGreaterThan(5);
    expect(attrFilters.map(a => a.key)).toContain('emergency_lighting_monthly');
  });

  it('uses only keys the matcher reads', () => {
    for (const e of scoped) {
      for (const k of Object.keys(e.suggestedScope)) expect(SCOPE_KEYS, `${e.key}: ${k}`).toContain(k);
    }
  });

  it('names each attribute filter by defName (or defId) with an operator the matcher knows', () => {
    for (const { key, f } of attrFilters) {
      expect(f.defName ?? f.defId, `${key}: no defName or defId`).toBeTruthy();
      expect(OPS, `${key}: op ${f.op}`).toContain(f.op);
    }
  });

  it('each attribute filter matches a component that has the attribute set, and only that one', () => {
    for (const { key, f, checkable } of attrFilters) {
      // A component of a type that carries the named attribute, with a value
      // the filter should accept (checkboxes: true) and one it should not.
      const def = { id: 'def-1', name: f.defName, checkable: f.checkable ?? checkable, display_type: 'checkbox' };
      const yes = f.op === 'is_false' ? 'false' : f.op === 'in' ? String(f.values?.[0]) : 'true';
      const no  = f.op === 'is_false' ? 'true'  : f.op === 'in' ? '__not_listed__'      : 'false';
      const attrs = (v) => ({ c1: [{ type_attribute_id: 'def-1', value: v }] });
      const insp  = (v) => ({ c1: { checklist_results: { 'def-1': v === 'true' } } });
      const run = (v) => matchesAttrFilter({ id: 'c1' }, [def], def.checkable ? {} : attrs(v),
                                           def.checkable ? insp(v) : {}, f);
      expect(run(yes), `${key}: should match ${f.defName} = ${yes}`).toBe(true);
      expect(run(no),  `${key}: should not match ${f.defName} = ${no}`).toBe(false);
    }
  });
});
