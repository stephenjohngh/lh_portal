// src/lib/apps/mobileplan/utils/planFilter.test.js
import { describe, it, expect } from 'vitest';
import {
  typesForSystem, systemState, toggleSystem, toggleStatus, isFiltered,
  componentRef, resultLabel, resultClass, STATUSES,
} from './planFilter.js';

const TYPES = [
  { code: 'FD',  initial: 'FD', building_system_id: 'fire' },
  { code: 'EL',  initial: 'L',  building_system_id: 'fire' },
  { code: 'DR',  initial: 'D',  building_system_id: 'access' },
];

describe('system helpers', () => {
  it('typesForSystem returns a system\'s types', () => {
    expect(typesForSystem(TYPES, 'fire').map(t => t.code)).toEqual(['FD', 'EL']);
    expect(typesForSystem(TYPES, 'nope')).toEqual([]);
  });

  it('systemState reflects how many of a system\'s types are hidden', () => {
    expect(systemState(TYPES, 'fire', new Set())).toBe('all');
    expect(systemState(TYPES, 'fire', new Set(['FD']))).toBe('some');
    expect(systemState(TYPES, 'fire', new Set(['FD', 'EL']))).toBe('none');
    // a system with no types reads as fully visible
    expect(systemState(TYPES, 'empty', new Set())).toBe('all');
  });

  it('toggleSystem hides a fully-visible system and shows an any-hidden one', () => {
    // all visible → hide all of the system's types
    expect([...toggleSystem(TYPES, 'fire', new Set())].sort()).toEqual(['EL', 'FD']);
    // some hidden → show all (clear the system)
    expect([...toggleSystem(TYPES, 'fire', new Set(['FD']))]).toEqual([]);
    // none hidden (all) → show all — leaves other systems untouched
    expect([...toggleSystem(TYPES, 'fire', new Set(['FD', 'EL', 'DR']))]).toEqual(['DR']);
  });

  it('toggleSystem returns a new Set (no mutation)', () => {
    const before = new Set();
    const after = toggleSystem(TYPES, 'fire', before);
    expect(before.size).toBe(0);
    expect(after).not.toBe(before);
  });
});

describe('toggleStatus', () => {
  it('adds then removes a status, immutably', () => {
    const a = toggleStatus('failed', new Set());
    expect([...a]).toEqual(['failed']);
    const b = toggleStatus('failed', a);
    expect([...b]).toEqual([]);
    expect([...a]).toEqual(['failed']);  // unchanged
  });
});

describe('isFiltered', () => {
  const c = { type_code: 'FD', status: 'ok' };
  it('hides by type', () => {
    expect(isFiltered(c, new Set(['FD']), new Set())).toBe(true);
    expect(isFiltered(c, new Set(['EL']), new Set())).toBe(false);
  });
  it('hides by status only when some statuses are hidden', () => {
    expect(isFiltered(c, new Set(), new Set(['ok']))).toBe(true);
    expect(isFiltered(c, new Set(), new Set(['failed']))).toBe(false);
    expect(isFiltered(c, new Set(), new Set())).toBe(false);   // empty = show all
  });
  it('is filtered if either rule matches', () => {
    expect(isFiltered(c, new Set(['FD']), new Set(['failed']))).toBe(true);
  });
});

describe('componentRef', () => {
  it('builds floor/typeInitial/assetId', () => {
    expect(componentRef({ asset_id: '12' }, 'G', { initial: 'FD' })).toBe('G/FD/12');
  });
  it('falls back gracefully for missing parts', () => {
    expect(componentRef({}, null, null)).toBe('?/?/—');
  });
});

describe('result label/class', () => {
  it('labels each status incl. no_access, and echoes unknowns', () => {
    expect(STATUSES).toEqual(['ok', 'problem', 'failed', 'inactive']);
    expect(resultLabel('no_access')).toBe('⊘ No access');
    expect(resultLabel('weird')).toBe('weird');
    expect(resultClass('no_access')).toBe('inactive');
    expect(resultClass('ok')).toBe('ok');
  });
});
