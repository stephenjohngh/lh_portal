// src/lib/utils/attrResolution.test.js
// resolveHierarchy is central to V2: it turns flat type_attributes rows into the
// effective per-type attribute set (system-inherited + type-own), with type-level
// rows that share an inherited name acting as default-value OVERRIDES rather than
// new attributes. These tests pin that behaviour.

import { describe, it, expect } from 'vitest';
import { resolveHierarchy } from './attrResolution.js';

const systems = [{ id: 'sys1' }];
const types   = [{ id: 'ty1', building_system_id: 'sys1' }];

describe('resolveHierarchy', () => {
  it('inherits system-scoped attrs into every type in that system, tagged _scope:system', () => {
    const defs = [{ id: 'a1', building_system_id: 'sys1', name: 'Fire rating', presentation_order: 1 }];
    const { attrDefs, systemAttrDefs } = resolveHierarchy(systems, types, defs);
    expect(systemAttrDefs.sys1).toHaveLength(1);
    expect(attrDefs.ty1).toHaveLength(1);
    expect(attrDefs.ty1[0]).toMatchObject({ id: 'a1', _scope: 'system' });
  });

  it('adds type-own attrs (that do not shadow an inherited name) tagged _scope:type', () => {
    const defs = [
      { id: 'a1', building_system_id: 'sys1', name: 'Fire rating', presentation_order: 1 },
      { id: 'a2', component_type_id:  'ty1',  name: 'Door gap',    presentation_order: 2 },
    ];
    const { attrDefs } = resolveHierarchy(systems, types, defs);
    expect(attrDefs.ty1.map(d => d.id)).toEqual(['a1', 'a2']);
    expect(attrDefs.ty1.find(d => d.id === 'a2')._scope).toBe('type');
  });

  it('treats a type-level row with an inherited name as a default-value OVERRIDE, not a new attr', () => {
    const defs = [
      { id: 'a1', building_system_id: 'sys1', name: 'Fire rating', default_value: 'FD30', presentation_order: 1 },
      { id: 'a1b', component_type_id: 'ty1',  name: 'Fire rating', default_value: 'FD60', presentation_order: 5 },
    ];
    const { attrDefs } = resolveHierarchy(systems, types, defs);
    // still a single effective attr, but with the override applied + flagged
    expect(attrDefs.ty1).toHaveLength(1);
    expect(attrDefs.ty1[0]).toMatchObject({
      id: 'a1', _scope: 'system', default_value: 'FD60', _defaultOverride: true, _overrideId: 'a1b',
    });
  });

  it('sorts the effective set by presentation_order', () => {
    const defs = [
      { id: 'a2', component_type_id: 'ty1', name: 'B', presentation_order: 9 },
      { id: 'a1', building_system_id: 'sys1', name: 'A', presentation_order: 1 },
    ];
    const { attrDefs } = resolveHierarchy(systems, types, defs);
    expect(attrDefs.ty1.map(d => d.id)).toEqual(['a1', 'a2']);
  });

  it('indexes options by attr def id and regime by type id when supplied', () => {
    const defs    = [{ id: 'a1', component_type_id: 'ty1', name: 'X', presentation_order: 1 }];
    const options = [{ id: 'o1', type_attribute_id: 'a1' }, { id: 'o2', type_attribute_id: 'a1' }];
    const regime  = [{ id: 'r1', type_id: 'ty1' }];
    const { attrOptions, regimeMap } = resolveHierarchy(systems, types, defs, options, regime);
    expect(attrOptions.a1).toHaveLength(2);
    expect(regimeMap.ty1).toHaveLength(1);
  });

  it('returns empty maps when nothing is supplied', () => {
    const { attrDefs, attrOptions, regimeMap, systemAttrDefs } = resolveHierarchy([], [], []);
    expect(attrDefs).toEqual({});
    expect(attrOptions).toEqual({});
    expect(regimeMap).toEqual({});
    expect(systemAttrDefs).toEqual({});
  });
});
