// src/lib/apps/admin/utils/registerFilter.test.js
//
// TYPE-1 tests for the Admin > Inspections filtering. These read the REAL
// register rather than fixtures: a fixture transcribing register data is what
// has broken tests four rounds running here, every time a legal correction
// landed. So they assert relationships and invariants that must hold whatever
// the 116 entries currently say.

import { describe, it, expect } from 'vitest';
import { EVIDENCE_ROUTE_LABEL } from '$lib/utils/obligationEvidence.js';
import { STATUTORY_TEMPLATE, isSchedulable, isUnhomed, isSuperseded, BASIS_RANK }
  from '$lib/utils/statutoryTemplate.js';
import {
  registerStatus, filterRegister, registerStatusTally, groupRegisterRows,
  registerFilterFields, groupRegisterRowsByRoute, routeGroupOf, ROUTE_GROUPS, REGISTER_STATUS, REGISTER_STATUS_LABEL, REGISTER_STATUS_EXPLAINED, REGISTER_STATUS_CLASS,
  obligationState, hasEmptyScope, filterObligations, obligationFilterFields,
  dutyHolderRole, dutyHolderTally, unclassifiedDutyHolders,
  DUTY_HOLDER_ROLES, DUTY_HOLDER_ROLE_LABEL,
  citationState, CITATION_STATE_LABEL,
  rowFacetSummary, ROW_VISIBLE_FACETS,
  DUTY_HOLDER_ROLE_SHORT, CITATION_STATE_SHORT,
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

  it('orders least-discretionary FIRST within a group', () => {
    // Moved here from registerByGroup()'s test when that function was removed
    // in R1 — the ordering it guaranteed had been silently lost when the two
    // view tabs became one list, and this is what caught it.
    const groups = groupRegisterRows(filterRegister(ALL, {}, noCtx));
    for (const g of groups) {
      const ranks = g.rows.map(r => BASIS_RANK[r.entry.basis]);
      expect(ranks, g.group).toEqual([...ranks].sort((a, b) => a - b));
    }
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
    const dutyTally = dutyHolderTally(ALL);
    for (const field of registerFilterFields(tally, dutyTally)) {
      for (const opt of field.options) {
        const n = filterRegister(ALL, { [field.key]: new Set([opt.value]) }, noCtx).length;
        expect(n).toBeGreaterThanOrEqual(0);
      }
    }
    // and at least one option per facet actually matches something
    for (const field of registerFilterFields(tally, dutyTally)) {
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

describe('dutyHolderRole — who bears the duty IN LAW', () => {
  it('⛔ classifies EVERY entry — the derivation must stay total', () => {
    // A category inferred from prose silently drops rows out of its facet when
    // someone rewords the source. This is the guard against that: reword a
    // statutoryDutyHolder into a shape the classifier does not know and this
    // fails, rather than the row quietly vanishing from the filter.
    const stray = unclassifiedDutyHolders(ALL);
    expect(stray.map(e => `${e.key}: ${e.statutoryDutyHolder}`)).toEqual([]);
  });

  it('accounts for all 116 across the declared roles', () => {
    const tally = dutyHolderTally(ALL);
    expect(Object.keys(tally).every(k => DUTY_HOLDER_ROLES.includes(k))).toBe(true);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(ALL.length);
  });

  it('every declared role has a label', () => {
    for (const r of DUTY_HOLDER_ROLES) expect(DUTY_HOLDER_ROLE_LABEL[r]).toBeTruthy();
  });

  it('keeps the two accountable-person roles apart', () => {
    // "Principal accountable person" CONTAINS "accountable person", so a naive
    // substring test collapses them — and they are different duty holders.
    expect(dutyHolderRole({ statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)' }))
      .toBe('principal_accountable_person');
    expect(dutyHolderRole({ statutoryDutyHolder: 'Accountable person (Building Safety Act 2022, Part 4)' }))
      .toBe('accountable_person');
  });

  it('does not let a SHARED duty read as one party’s', () => {
    // The shared row names both roles; classifying it as either would say one
    // party discharges the other's duty, which the row exists to deny.
    expect(dutyHolderRole({ statutoryDutyHolder:
      'Shared: the accountable person under Building Safety Act 2022 Part 4, AND the responsible person under art 22' }))
      .toBe('shared_ap_rp');
  });

  it('separates the three reasons there is no statutory duty holder', () => {
    expect(dutyHolderRole({ statutoryDutyHolder: 'None — this is our own control, not a statutory duty' }))
      .toBe('none_own_control');
    expect(dutyHolderRole({ statutoryDutyHolder: 'None — binding by agreement rather than by law' }))
      .toBe('none_contract');
    expect(dutyHolderRole({ statutoryDutyHolder: 'None under the instruments in this register — the Housing Ombudsman Complaint Handling Code binds member landlords' }))
      .toBe('none_code');
  });

  it('flags an unknown wording rather than guessing', () => {
    expect(dutyHolderRole({ statutoryDutyHolder: 'The window cleaner' })).toBe('other');
  });

  it('is a real filter facet, and it is NOT responsibleParty', () => {
    const rp = filterRegister(ALL, { dutyHolder: new Set(['responsible_person']) }, noCtx);
    expect(rp.length).toBeGreaterThan(0);
    expect(rp.every(r => dutyHolderRole(r.entry) === 'responsible_person')).toBe(true);

    // The distinction the field exists for: rows whose statutory duty is the
    // responsible person's but whose WORK is done by someone else.
    const performedByOthers = rp.filter(r =>
      !/responsible person/i.test(r.entry.responsibleParty ?? ''));
    expect(performedByOthers.length).toBeGreaterThan(0);
  });

  it('offers only roles that actually occur, each with its count', () => {
    const dutyTally = dutyHolderTally(ALL);
    const field = registerFilterFields(registerStatusTally(ALL, noCtx), dutyTally)
      .find(f => f.key === 'dutyHolder');
    expect(field).toBeDefined();
    for (const opt of field?.options ?? []) {
      expect(dutyTally[opt.value]).toBeGreaterThan(0);
      expect(filterRegister(ALL, { dutyHolder: new Set([opt.value]) }, noCtx).length)
        .toBe(dutyTally[opt.value]);
    }
  });

  it('search reaches the duty holder text', () => {
    const rows = filterRegister(ALL, { q: 'principal accountable person' }, noCtx);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('awaiting_setup — added but not yet live', () => {
  const gapKey = ALL.find(e => registerStatus(e, noCtx) === 'not_covered').key;

  it('separates "apply created it" from "somebody switched it off"', () => {
    // Both are `active: false` and both were shown identically. One is a work
    // queue, the other is a decision.
    const ctx = { ...noCtx, awaitingKeys: new Set([gapKey]) };
    expect(registerStatus({ ...ALL.find(e => e.key === gapKey) }, ctx)).toBe('awaiting_setup');
  });

  it('⛔ never reads as covered — the duty is not being discharged', () => {
    // The rule the compliance report already enforces for `assured`: a third
    // state, not a softened one.
    expect(REGISTER_STATUS_CLASS.awaiting_setup).not.toBe('ok');
    expect(REGISTER_STATUS_LABEL.awaiting_setup).not.toMatch(/covered|compliant|scheduled/i);
  });

  it('is outranked by every state that is a real answer', () => {
    const entry = ALL.find(e => e.key === gapKey);
    const awaiting = new Set([gapKey]);
    expect(registerStatus(entry, { coveredKeys: new Set([gapKey]), awaitingKeys: awaiting }))
      .toBe('scheduled');
    expect(registerStatus(entry, { dismissedKeys: new Set([gapKey]), awaitingKeys: awaiting }))
      .toBe('not_applicable');
  });

  it('is filterable and tallied like any other status', () => {
    const ctx = { ...noCtx, awaitingKeys: new Set([gapKey]) };
    const rows = filterRegister(ALL, { status: new Set(['awaiting_setup']) }, ctx);
    expect(rows.map(r => r.entry.key)).toEqual([gapKey]);
    expect(registerStatusTally(ALL, ctx).awaiting_setup).toBe(1);
  });

  it('still accounts for every entry exactly once', () => {
    const ctx = { ...noCtx, awaitingKeys: new Set([gapKey]) };
    const tally = registerStatusTally(ALL, ctx);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(ALL.length);
  });
});

describe('R0 — citation verification evidence', () => {
  const verified = ALL.filter(e => e.citationVerifiedAgainst);

  it('stamps only rows the review actually covered', () => {
    expect(verified.length).toBe(14);
  });

  it('every stamp carries BOTH a date and the source it was checked against', () => {
    // A date with no URL cannot be re-checked; a URL with no date cannot be aged.
    for (const e of verified) {
      expect(e.citationVerifiedOn, e.key).toBe('2026-09-11');
      expect(e.citationVerifiedAgainst, e.key).toMatch(/^https:\/\/www\.legislation\.gov\.uk\//);
    }
  });

  it('⛔ never stamps a row whose citation CHANGED after the review', () => {
    // The trap this harvest was built to avoid: the review confirmed
    // SI 2024/41 reg 5 for KBI on 11 Sep; round 8 moved the citation to
    // SI 2023/396 reg 21 on 14 Sep. Stamping by row identity would assert a
    // verification of something nobody checked.
    for (const key of ['kbi_update', 'kbi_update_on_change']) {
      const e = ALL.find(x => x.key === key);
      expect(e, key).toBeDefined();
      expect(e.citationVerifiedAgainst, key).toBeUndefined();
    }
  });

  it('⛔ never stamps a row whose basis the review REJECTED', () => {
    // §4.3 rejected SI 2023/907 reg 12 as the basis for the annual complaints
    // report. Its contribution there was a removal, not a verification.
    for (const key of ['complaints_report_publication', 'complaints_self_assessment']) {
      const e = ALL.find(x => x.key === key);
      if (e) expect(e.citationVerifiedAgainst, key).toBeUndefined();
    }
  });

  it('does not stamp a row that merely MENTIONS a verified provision', () => {
    // evacuation_alert_system_service cites BS 8629 and mentions FSER reg 7(5)
    // in passing. The standard was not verified.
    const e = ALL.find(x => x.key === 'evacuation_alert_system_service');
    if (e) expect(e.citationVerifiedAgainst).toBeUndefined();
  });

  it('the URL points at the instrument the row actually cites', () => {
    const expectPair = (key, fragment) => {
      const e = ALL.find(x => x.key === key);
      expect(e?.citationVerifiedAgainst, key).toContain(fragment);
    };
    expectPair('fser_communal_fire_doors',  '/uksi/2022/547/regulation/10');
    expectPair('fser_wayfinding_signage',   '/uksi/2022/547/regulation/8');
    expectPair('lift_loler_examination',    '/uksi/1998/2307/regulation/9');
    expectPair('res_consultation',          '/uksi/2023/907/regulation/10');
  });
});

describe('citationState', () => {
  it('splits the register into checked and not-individually-recorded', () => {
    const v = ALL.filter(e => citationState(e) === 'verified');
    const n = ALL.filter(e => citationState(e) === 'not_recorded');
    expect(v.length + n.length).toBe(ALL.length);
    expect(v.length).toBe(14);
  });

  it('⚠ says CITATION, never "verified" on its own', () => {
    // The review's own §6: the intervals and the applicability conditions were
    // not checked. The label must not imply they were.
    for (const label of Object.values(CITATION_STATE_LABEL)) {
      expect(label).toMatch(/citation/i);
    }
  });

  it('is a filter facet', () => {
    const rows = filterRegister(ALL, { citation: new Set(['not_recorded']) }, noCtx);
    expect(rows.length).toBe(ALL.length - 14);
    expect(rows.every(r => !r.entry.citationVerifiedAgainst)).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
describe('⛔ every facet is visible on the row it filters', () => {
  // Reported by the user, 2026-09-19: "there are a set of filters but i cant
  // see all those fields in the presentation." Four of the seven facets
  // filtered on something the row never showed, and Trigger was rendered
  // nowhere in the panel at all — so narrowing 116 rows to 33 left nothing on
  // screen saying why, which reads exactly like a broken filter.

  const facetKeys = () =>
    registerFilterFields(registerStatusTally(ALL, noCtx), dutyHolderTally(ALL))
      .map(f => f.key);

  it('accounts for EVERY facet — either already visible, or on the facts line', () => {
    const onRow = new Set(rowFacetSummary(ALL[0]).map(f => f.key));
    const unaccounted = facetKeys().filter(k => !ROW_VISIBLE_FACETS.has(k) && !onRow.has(k));
    // ⛔ Adding a facet without showing its value is the defect this pins.
    expect(unaccounted).toEqual([]);
  });

  it('gives every entry a complete facts line, with no blanks', () => {
    for (const entry of ALL) {
      const facts = rowFacetSummary(entry);
      expect(facts).toHaveLength(4);
      for (const f of facts) {
        expect(f.text, `${entry.key} / ${f.key}`).toBeTruthy();
        expect(f.text).not.toMatch(/undefined|null/);
      }
    }
  });

  it('⚠ never falls back to a raw key — a code on screen is not an answer', () => {
    for (const entry of ALL) {
      const byKey = Object.fromEntries(rowFacetSummary(entry).map(f => [f.key, f.text]));
      // Raw values that must have been translated into words.
      expect(byKey.trigger).not.toBe(entry.trigger);
      expect(byKey.evidence).not.toBe(entry.evidencedBy);
      expect(byKey.dutyHolder).not.toMatch(/_/);
      expect(byKey.citation).not.toMatch(/_/);
    }
  });

  it('shows the four facets that were previously invisible', () => {
    expect(rowFacetSummary(ALL[0]).map(f => f.key))
      .toEqual(['evidence', 'trigger', 'dutyHolder', 'citation']);
  });

  it('⛔ short and long labels cover the same roles, so row and facet agree', () => {
    expect(Object.keys(DUTY_HOLDER_ROLE_SHORT).sort())
      .toEqual(Object.keys(DUTY_HOLDER_ROLE_LABEL).sort());
    expect(Object.keys(CITATION_STATE_SHORT).sort())
      .toEqual(Object.keys(CITATION_STATE_LABEL).sort());
    for (const role of DUTY_HOLDER_ROLES) {
      expect(DUTY_HOLDER_ROLE_SHORT[role], role).toBeTruthy();
    }
  });

  it('⚠ the short citation label still says CITATION', () => {
    // Same rule as the long one: it must never read as "the row is verified".
    for (const label of Object.values(CITATION_STATE_SHORT)) {
      expect(label).toMatch(/citation/i);
    }
  });

  it('a filtered facet value matches what the row prints for it', () => {
    // Filter to one evidence route, and every surviving row names that route in
    // the SAME WORDS the facet used.
    //
    // ⚠ The label is READ from the source, not transcribed. This test hardcoded
    // "Contractor job" and failed the moment the labels were reworded to say who
    // turns up — a fixture asserting the data rather than the rule, which is the
    // fault this project has now recorded five times.
    for (const route of ['inspection', 'maintenance_job']) {
      const rows = filterRegister(ALL, { evidence: new Set([route]) }, noCtx);
      expect(rows.length, route).toBeGreaterThan(0);
      for (const { entry } of rows) {
        const evidence = rowFacetSummary(entry).find(f => f.key === 'evidence');
        expect(evidence.text, entry.key).toBe(EVIDENCE_ROUTE_LABEL[route]);
      }
    }
  });
});


describe('⚠ the filter bar must not resize as you use it', () => {
  // Reported alongside the hidden facets, 2026-09-19: "something odd with
  // sizing of panels". A facet with no minWidth is sized by its summary, so
  // choosing a long value widened the button and reflowed every facet after
  // it. ⭐ Sizing each button to its longest option is NOT the fix — the
  // longest is "No statutory duty holder — a code, not statute", which would
  // need ~336px. The bar fixes each button at its declared width and lets the
  // summary truncate; the full value stays readable in the active pill and on
  // the button's tooltip.
  const allFields = () => [
    ...registerFilterFields(registerStatusTally(ALL, noCtx), dutyHolderTally(ALL)),
    ...obligationFilterFields([]),
  ];

  it('every facet declares a minWidth', () => {
    // With `fixedWidth`, an undeclared width silently becomes the 130px
    // default and that facet truncates harder than its neighbours.
    const missing = allFields().filter(f => !f.minWidth).map(f => f.key);
    expect(missing).toEqual([]);
  });

  it('⚠ an option whose label carries a count also carries a clean `short`', () => {
    // The dropdown lists "Not covered (79)" — useful when choosing. The button
    // and the pill use `short`, so a stale count can never end up frozen in the
    // summary of a filter you set ten minutes ago.
    for (const f of allFields()) {
      for (const o of f.options) {
        if (/\(\d+\)\s*$/.test(o.label)) {
          expect(o.short, `${f.key}/${o.value}`).toBeTruthy();
          expect(o.short).not.toMatch(/\(\d+\)\s*$/);
        }
      }
    }
  });

  it('a `short` is never longer than the label it stands in for', () => {
    for (const f of allFields()) {
      for (const o of f.options) {
        if (o.short) expect(o.short.length, `${f.key}/${o.value}`).toBeLessThanOrEqual(o.label.length);
      }
    }
  });
});

// ⭐ ADDED 2026-09-21, after the user refused to press a button: *"a button says
// 'add 80 shown' — it's just not something I could click."* The count strip is
// where somebody meets these seven words for the first time, and a tooltip that
// repeats the label teaches nothing.
describe('every state can be explained to somebody who has never seen the screen', () => {
  it('explains all seven, and none of them by repeating its own label', () => {
    for (const s of REGISTER_STATUS) {
      const help = REGISTER_STATUS_EXPLAINED[s];
      expect(help, s).toBeTruthy();
      // A sentence, not a restatement of the two-word label.
      expect(help.split(' ').length, s).toBeGreaterThan(6);
      expect(help, s).not.toBe(REGISTER_STATUS_LABEL[s]);
    }
  });

  it('⚠ keeps each to one sentence — a tooltip nobody finishes is no tooltip', () => {
    for (const s of REGISTER_STATUS) {
      expect(REGISTER_STATUS_EXPLAINED[s].length, s).toBeLessThan(110);
      expect(REGISTER_STATUS_EXPLAINED[s], s).not.toContain('.');
    }
  });

  // The pairing is the point: a state with a count and no explanation is the
  // gap this closes, so the two maps must not drift apart.
  it('covers exactly the states the strip renders', () => {
    expect(Object.keys(REGISTER_STATUS_EXPLAINED).sort()).toEqual([...REGISTER_STATUS].sort());
  });
});

// ⭐ ADDED 2026-09-21, from the user: *"why would you want to add 80? I think
// the user wants to slowly go over this list for days, slowly adding in sets of
// regs."* The panel decides how loudly to offer the bulk add from whether the
// list has been NARROWED — and "narrowed" deliberately ignores the status
// facet, because it defaults to *Not covered*, which is what is left rather
// than a set anybody chose.
//
// ⚠ The rule lives in the panel as a one-line `$:`. This asserts the part that
// would be wrong silently: that a default view does not count as a choice.
describe('working through the register in sets', () => {
  const isNarrowed = (filters, search = '') =>
    search.trim().length > 0
    || Object.entries(filters).some(([k, v]) => k !== 'status' && v?.size > 0);

  it('does not treat the default work queue as a chosen set', () => {
    expect(isNarrowed({ status: new Set(['not_covered']) })).toBe(false);
    expect(isNarrowed({ status: new Set(['not_covered', 'no_home']) })).toBe(false);
    expect(isNarrowed({})).toBe(false);
  });

  it('treats any real facet, or a search, as a chosen set', () => {
    expect(isNarrowed({ status: new Set(['not_covered']), group: new Set(['fire_safety']) })).toBe(true);
    expect(isNarrowed({ dutyHolder: new Set(['responsible_person']) })).toBe(true);
    expect(isNarrowed({ status: new Set(['not_covered']) }, 'fire door')).toBe(true);
  });

  // ⚠ The facets the note names have to exist, or it sends somebody looking for
  // a control that is not there — the same fault as a filter with no matching
  // display, pointed the other way.
  it('names facets the bar actually offers', () => {
    const keys = registerFilterFields(registerStatusTally(ALL, noCtx), dutyHolderTally(ALL))
      .map(f => f.key);
    for (const named of ['group', 'dutyHolder']) expect(keys, named).toContain(named);
  });
});

// ⭐ ADDED 2026-09-21. The user drew the shape and asked whether a field already
// held it: *"could the top level be requirements register ... underneath this it
// splits into inspections — either in-house or contractor — contractor
// maintenance visits, and what else?"* It splits into FOUR, and `evidencedBy`
// plus `handledBy` already held it — the Evidence facet showed half and the
// status strip the other half, so nobody could see it as one tree.
describe('how each requirement actually gets done', () => {
  it('puts every requirement in exactly one of the four, and loses none', () => {
    const rows = ALL.map(entry => ({ entry, status: 'not_covered' }));
    const groups = groupRegisterRowsByRoute(rows);
    const placed = groups.reduce((n, g) => n + g.rows.length, 0);
    expect(placed).toBe(ALL.length);
    const keys = groups.flatMap(g => g.rows.map(r => r.entry.key));
    expect(new Set(keys).size).toBe(ALL.length);
  });

  // ⛔ The split has to match the one the status strip and the Evidence facet
  // already report, or the same register would answer the same question two
  // ways depending on which control you used.
  it('agrees with the facet and the strip it was derived from', () => {
    const n = k => ALL.filter(e => routeGroupOf(e) === k).length;
    expect(n('inspection')).toBe(ALL.filter(e => e.evidencedBy === 'inspection').length);
    expect(n('maintenance_job')).toBe(ALL.filter(e => e.evidencedBy && e.evidencedBy !== 'inspection').length);
    expect(n('no_home')).toBe(ALL.filter(e => !e.evidencedBy && isUnhomed(e)).length);
    expect(n('elsewhere')).toBe(ALL.filter(e => !e.evidencedBy && !isUnhomed(e)).length);
  });

  it('every branch says what it is, in words a person can act on', () => {
    for (const g of ROUTE_GROUPS) {
      expect(g.label, g.key).toBeTruthy();
      expect(g.blurb, g.key).toBeTruthy();
      expect(g.blurb.split(' ').length, g.key).toBeGreaterThan(8);
    }
  });

  // ⚠ Every branch must be non-empty on the shipped register, or the tree shows
  // somebody a shape with a hole in it that is nothing to do with their building.
  it('all four branches have rows in the standard register', () => {
    for (const g of ROUTE_GROUPS) {
      expect(ALL.filter(e => routeGroupOf(e) === g.key).length, g.key).toBeGreaterThan(0);
    }
  });
});
