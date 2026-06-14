// src/lib/utils/componentRef.test.js
// Component reference strings are "{floorShortName}/{typeInitial}/{assetId}".
// These helpers resolve a ref back to a component and follow component links.

import { describe, it, expect } from 'vitest';
import { fmtComponentRef, findComponentByRef, resolveLinkedComponents } from './componentRef.js';

const floors = [{ id: 'f1', short_name: 'G' }, { id: 'f2', short_name: '1' }];
const types  = [{ code: 'fd', initial: 'FD' }, { code: 'lt', initial: 'L' }];
const components = [
  { id: 'c1', floor_id: 'f1', type_code: 'fd', asset_id: 'FD-042' },
  { id: 'c2', floor_id: 'f2', type_code: 'lt', asset_id: 'L-007' },
];

describe('fmtComponentRef', () => {
  it('returns the ref as-is, or a dash when empty', () => {
    expect(fmtComponentRef('G/FD/FD-042')).toBe('G/FD/FD-042');
    expect(fmtComponentRef('')).toBe('—');
    expect(fmtComponentRef(null)).toBe('—');
  });
});

describe('findComponentByRef', () => {
  it('resolves a matching ref to its component', () => {
    const found = findComponentByRef('G/FD/FD-042', components, floors, [], types);
    expect(found?.id).toBe('c1');
  });
  it('returns null when no component matches', () => {
    expect(findComponentByRef('G/FD/NOPE', components, floors, [], types)).toBeNull();
  });
  it('returns null for malformed refs and empty inputs', () => {
    expect(findComponentByRef('G/FD', components, floors, [], types)).toBeNull(); // only 2 parts
    expect(findComponentByRef('', components, floors, [], types)).toBeNull();
    expect(findComponentByRef('G/FD/FD-042', [], floors, [], types)).toBeNull();
  });
});

describe('resolveLinkedComponents', () => {
  it('resolves every link from a component, dropping unresolvable refs', () => {
    const links = { c1: [
      { to_component_ref: '1/L/L-007' },   // resolves to c2
      { to_component_ref: 'X/Y/Z' },       // unresolvable → dropped
    ] };
    const out = resolveLinkedComponents('c1', links, components, floors, [], types);
    expect(out.map(c => c.id)).toEqual(['c2']);
  });
  it('returns [] when the component has no links', () => {
    expect(resolveLinkedComponents('c1', {}, components, floors, [], types)).toEqual([]);
  });
});
