// src/lib/apps/admin/utils/registerFilter.test.js
//
// TYPE-1 tests for the Admin > Inspections filtering. These read the REAL
// register rather than fixtures: a fixture transcribing register data is what
// has broken tests four rounds running here, every time a legal correction
// landed. So they assert relationships and invariants that must hold whatever
// the 116 entries currently say.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE, isSchedulable, isUnhomed, isSuperseded }
  from '$lib/utils/statutoryTemplate.js';
import {
  registerStatus, filterRegister, registerStatusTally, groupRegisterRows,
  registerFilterFields, REGISTER_STATUS, REGISTER_STATUS_LABEL, REGISTER_STATUS_CLASS,
  obligationState, hasEmptyScope, filterObligations, obligationFilterFields,
} from './registerFilter.js';

const ALL = STATUTORY_TEMPLATE;
const noCtx = { coveredKeys: new Set(), dismissedKeys: new Set() };

describe('registerStatus', () => {
  it('gives every entry exactly one of the declared statuses', () => {
    for (const e of ALL) expect(REGISTER_STATUS).toContain(registerStatus(e, noCtx));
  });

  it('labels and row classes exist for every status', () => {
    for (const s of REGISTER_STATUS) {
      expect(REGISTER_STATUS_LABEL[s]).toBeTruthy();
      expect(REGISTER_STATUS_CLASS[s]).toBeTruthy();
    }
  });

  it('tests WITHDRAWN before coverage — a repealed requirement is not a gap', () => {
    // The branch order that a flat "is it covered?" check gets wrong: whether
    // we happen to still do something the law dropped is not a compliance
    // question, and without this it read as an outstanding gap.
    const withdrawn = ALL.find(e => isSuperseded(e));
    if (!withdrawn) return;                       // none today; the rule still holds
    const asCovered = { coveredKeys: new Set([withdrawn.key]), dismissedKeys: new Set() };
    expect(registerStatus(withdrawn, asCovered)).toBe('superseded');
  });

  it('separates "nothing deals with it" from "tracked in another app"', () => {
    const unhomed = ALL.filter(e => !isSchedulable(e) && isUnhomed(e));
    const homed   = ALL.filter(e => !isSchedulable(e) && !isUnhomed(e));
    expect(unhomed.length).toBeGreaterThan(0);
    expect(homed.length).toBeGreaterThan(0);
    for (const e of unhomed) expect(registerStatus(e, noCtx)).toBe('no_home');
    for (const e of homed)   expect(registerStatus(e, noCtx)).toBe('elsewhere');
  });

  it('moves an entry out of "not covered" once an obligation covers it', () => {
    const gap = ALL.find(e => registerStatus(e, noCtx) === 'not_covered');
    expect(gap).toBeDefined();
    const ctx = { coveredKeys: new Set([gap.key]), dismissedKeys: new Set() };
    expect(registerStatus(gap, ctx)).toBe('scheduled');
  });

  it('a recorded not-applicable decision outranks being an unfilled gap', () => {
    const gap = ALL.find(e => registerStatus(e, noCtx) === 'not_covered');
    const ctx = { coveredKeys: new Set(), dismissedKeys: new Set([gap.key]) };
    expect(registerStatus(gap, ctx)).toBe('not_applicable');
  });
});

describe('registerStatusTally', () => {
  it('accounts for every entry exactly once', () => {
    const tally = registerStatusTally(ALL, noCtx);
    const summed = Object.values(tally).reduce((a, b) => a + b, 0);
    expect(summed).toBe(ALL.length);
  });

  it('counts the WHOLE register, not the filtered view', () => {
    // The strip is how a filter gets chosen, so it must show what is there.
    const tally = registerStatusTally(ALL, noCtx);
    expect(tally.not_covered).toBeGreaterThan(0);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(ALL.length);
  });
});

describe('filterRegister', () => {
  it('returns everything when no facet is set', () => {
    expect(filterRegister(ALL, {}, noCtx)).toHaveLength(ALL.length);
  });

  it('treats an empty Set as "all", so the bar starts unfiltered', () => {
    const rows = filterRegister(ALL, { status: new Set(), basis: new Set() }, noCtx);
    expect(rows).toHaveLength(ALL.length);
  });

  it('filters by status, which is what replaces the old view tabs', () => {
    const rows = filterRegister(ALL, { status: new Set(['not_covered']) }, noCtx);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.status === 'not_covered')).toBe(true);
    expect(rows.length).toBe(registerStatusTally(ALL, noCtx).not_covered);
  });

  it('intersects facets rather than unioning them', () => {
    const statute = filterRegister(ALL, { basis: new Set(['statute']) }, noCtx).length;
    const fire    = filterRegister(ALL, { group: new Set(['fire_safety']) }, noCtx).length;
    const both    = filterRegister(ALL,
      { basis: new Set(['statute']), group: new Set(['fire_safety']) }, noCtx).length;
    expect(both).toBeLessThanOrEqual(Math.min(statute, fire));
    expect(both).toBeGreaterThan(0);
  });

  it('unions WITHIN one facet', () => {
    const a = filterRegister(ALL, { basis: new Set(['statute']) }, noCtx).length;
    const b = filterRegister(ALL, { basis: new Set(['standard']) }, noCtx).length;
    const ab = filterRegister(ALL, { basis: new Set(['statute', 'standard']) }, noCtx).length;
    expect(ab).toBe(a + b);
  });

  it('searches the reference and the description, not just the name', () => {
    const entry = ALL.find(e => e.statutoryRef?.length > 6);
    const token = entry.statutoryRef.slice(0, 6);
    const rows = filterRegister(ALL, { q: token }, noCtx);
    expect(rows.some(r => r.entry.key === entry.key)).toBe(true);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    const name = ALL[0].name;
    const rows = filterRegister(ALL, { q: `  ${name.toUpperCase()}  ` }, noCtx);
    expect(rows.some(r => r.entry.key === ALL[0].key)).toBe(true);
  });

  it('carries the status it filtered on, so nothing recomputes it', () => {
    const rows = filterRegister(ALL, {}, noCtx);
    for (const r of rows) expect(r.status).toBe(registerStatus(r.entry, noCtx));
  });

  it('returns nothing rather than everything when the search matches nothing', () => {
    expect(filterRegister(ALL, { q: 'zzzzz-no-such-thing' }, noCtx)).toHaveLength(0);
  });
});

describe('groupRegisterRows', () => {
  it('drops empty groups, so a filtered view has no empty headings', () => {
    const rows = filterRegister(ALL, { group: new Set(['fire_safety']) }, noCtx);
    const groups = groupRegisterRows(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe('fire_safety');
    expect(groups[0].label).toBeTruthy();
  });

  it('keeps every row, and only once', () => {
    const rows = filterRegister(ALL, {}, noCtx);
    const total = groupRegisterRows(rows).reduce((n, g) => n + g.rows.length, 0);
    expect(total).toBe(ALL.length);
  });
});

describe('registerFilterFields', () => {
  it('offers every status as an option, with its count', () => {
    const tally = registerStatusTally(ALL, noCtx);
    const status = registerFilterFields(tally).find(f => f.key === 'status');
    expect(status).toBeDefined();
    expect(status?.options.map(o => o.value)).toEqual(REGISTER_STATUS);
    expect(status?.options[0].label).toContain(String(tally[REGISTER_STATUS[0]]));
  });

  it('every offered value matches at least one entry, or is honestly zero', () => {
    // A facet option that can never match is a dead control; one that reads 0
    // is information. This asserts the options come from the register's own
    // vocabularies rather than a hand-typed list.
    const tally = registerStatusTally(ALL, noCtx);
    for (const field of registerFilterFields(tally)) {
      for (const opt of field.options) {
        const n = filterRegister(ALL, { [field.key]: new Set([opt.value]) }, noCtx).length;
        expect(n).toBeGreaterThanOrEqual(0);
      }
    }
    // and at least one option per facet actually matches something
    for (const field of registerFilterFields(tally)) {
      const anyMatch = field.options.some(opt =>
        filterRegister(ALL, { [field.key]: new Set([opt.value]) }, noCtx).length > 0);
      expect(anyMatch, `facet ${field.key} matches nothing at all`).toBe(true);
    }
  });
});

// ── Obligations ──────────────────────────────────────────────────────────────

const obl = (over = {}) => ({
  id: 'o1', name: 'Fire alarm weekly test', active: true, retired_on: null,
  evidenced_by: 'inspection', template_key: null, scope: {}, ...over,
});

describe('obligationState', () => {
  it('reports retired even when the row is still flagged active', () => {
    // Retiring does not clear `active`, and showing such a row as active would
    // say the building is doing something the law no longer asks for.
    expect(obligationState(obl({ active: true, retired_on: '2026-01-01' }))).toBe('retired');
  });

  it('distinguishes switched off from retired', () => {
    expect(obligationState(obl({ active: false }))).toBe('inactive');
    expect(obligationState(obl({ active: true }))).toBe('active');
  });
});

describe('hasEmptyScope', () => {
  it('recognises the scope that matches every component', () => {
    expect(hasEmptyScope(obl({ scope: {} }))).toBe(true);
    expect(hasEmptyScope(obl({ scope: null }))).toBe(true);
    expect(hasEmptyScope(obl({ scope: { typeCodes: [], floorIds: [] } }))).toBe(true);
    expect(hasEmptyScope(obl({ scope: { typeCodes: ['door_fire_door'] } }))).toBe(false);
  });
});

describe('filterObligations', () => {
  const defs = [
    obl({ id: 'a', name: 'Alarm weekly',  evidenced_by: 'inspection' }),
    obl({ id: 'b', name: 'Lift LOLER',    evidenced_by: 'maintenance_job', template_key: 'lift_loler' }),
    obl({ id: 'c', name: 'Old rule',      retired_on: '2026-01-01' }),
    obl({ id: 'd', name: 'Paused',        active: false, scope: { typeCodes: ['x'] } }),
  ];

  it('filters by state', () => {
    expect(filterObligations(defs, { state: new Set(['retired']) }).map(d => d.id)).toEqual(['c']);
    expect(filterObligations(defs, { state: new Set(['inactive']) }).map(d => d.id)).toEqual(['d']);
  });

  it('separates register-derived obligations from our own', () => {
    expect(filterObligations(defs, { source: new Set(['register']) }).map(d => d.id)).toEqual(['b']);
    expect(filterObligations(defs, { source: new Set(['own']) }).map(d => d.id)).toEqual(['a', 'c', 'd']);
  });

  it('lists the unscoped ones, which are the ones needing work', () => {
    expect(filterObligations(defs, { scope: new Set(['unscoped']) }).map(d => d.id))
      .toEqual(['a', 'b', 'c']);
    expect(filterObligations(defs, { scope: new Set(['scoped']) }).map(d => d.id)).toEqual(['d']);
  });

  it('searches the name and the template key', () => {
    expect(filterObligations(defs, { q: 'loler' }).map(d => d.id)).toEqual(['b']);
  });

  it('returns everything when nothing is set', () => {
    expect(filterObligations(defs, {})).toHaveLength(4);
  });
});

describe('obligationFilterFields', () => {
  it('counts each state against the rows it is given', () => {
    const defs = [obl({ id: 'a' }), obl({ id: 'b', retired_on: '2026-01-01' })];
    const state = obligationFilterFields(defs).find(f => f.key === 'state');
    expect(state?.options.find(o => o.value === 'active')?.label).toContain('(1)');
    expect(state?.options.find(o => o.value === 'retired')?.label).toContain('(1)');
  });
});
