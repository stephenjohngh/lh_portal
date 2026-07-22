// src/lib/apps/maintenance/utils/groupMembership.test.js
//
// Pins the live group-membership resolver: union across system/type/space
// criteria, dedupe, condition roll-up off components.status, and the manual-line
// (no-criteria) case. Space membership is exercised via an `include` override so
// the test doesn't depend on plan geometry (spaceMembership has its own geometry
// tests).

import { describe, it, expect } from 'vitest';
import { makeGroupMembershipResolver, resolveGroupMembership } from './groupMembership.js';

// Two systems, three types (LIGHT+POWER in ELEC, LIFT in MECH).
const types = [
  { code: 'LIGHT', building_system_id: 'sys-elec' },
  { code: 'POWER', building_system_id: 'sys-elec' },
  { code: 'LIFT',  building_system_id: 'sys-mech' },
];

// Components with a current status.
const components = [
  { id: 'c1', type_code: 'LIGHT', status: 'ok',       plan_id: 'p1', x_position: 0.1, y_position: 0.1 },
  { id: 'c2', type_code: 'LIGHT', status: 'problem',  plan_id: 'p1', x_position: 0.2, y_position: 0.2 },
  { id: 'c3', type_code: 'POWER', status: 'failed',   plan_id: 'p1', x_position: 0.3, y_position: 0.3 },
  { id: 'c4', type_code: 'LIFT',  status: 'ok',       plan_id: 'p1', x_position: 0.4, y_position: 0.4 },
  { id: 'c5', type_code: 'LIFT',  status: 'inactive', plan_id: 'p1', x_position: 0.5, y_position: 0.5 },
];

const ctx = { components, types };

describe('makeGroupMembershipResolver', () => {
  it('resolves by system (via each component type\'s building_system_id)', () => {
    const r = makeGroupMembershipResolver(ctx)({ system_ids: ['sys-elec'] });
    expect(r.componentIds.sort()).toEqual(['c1', 'c2', 'c3']); // all ELEC types
    expect(r.total).toBe(3);
    expect(r.byStatus).toEqual({ ok: 1, problem: 1, failed: 1, inactive: 0 });
    expect(r.attention).toBe(2); // problem + failed
    expect(r.manual).toBe(false);
  });

  it('resolves by type_code', () => {
    const r = makeGroupMembershipResolver(ctx)({ type_codes: ['LIFT'] });
    expect(r.componentIds.sort()).toEqual(['c4', 'c5']);
    expect(r.byStatus.inactive).toBe(1);
    expect(r.attention).toBe(0);
  });

  it('unions criteria and dedupes a component matching more than one', () => {
    // system ELEC (c1,c2,c3) ∪ type LIFT (c4,c5) — no overlap here → 5.
    const r1 = makeGroupMembershipResolver(ctx)({ system_ids: ['sys-elec'], type_codes: ['LIFT'] });
    expect(r1.total).toBe(5);
    // system ELEC ∪ type LIGHT — LIGHT ⊂ ELEC, so still just the 3 ELEC, no double count.
    const r2 = makeGroupMembershipResolver(ctx)({ system_ids: ['sys-elec'], type_codes: ['LIGHT'] });
    expect(r2.componentIds.sort()).toEqual(['c1', 'c2', 'c3']);
    expect(r2.total).toBe(3);
  });

  it('resolves by space via an include override (no geometry needed)', () => {
    const spaces = [{ id: 'sp1', plan_id: 'p1', polygon: [] }];
    const overrides = [
      { space_id: 'sp1', component_id: 'c4', mode: 'include' },
      { space_id: 'sp1', component_id: 'c5', mode: 'include' },
    ];
    const r = makeGroupMembershipResolver({ components, types, spaces, spaceOverrides: overrides })(
      { space_ids: ['sp1'] });
    expect(r.componentIds.sort()).toEqual(['c4', 'c5']);
  });

  it('treats a group with no criteria as a manual capital line', () => {
    const r = makeGroupMembershipResolver(ctx)({});
    expect(r.manual).toBe(true);
    expect(r.total).toBe(0);
    expect(r.byStatus).toEqual({ ok: 0, problem: 0, failed: 0, inactive: 0 });
  });

  it('ignores unknown statuses in the roll-up but still counts the member', () => {
    const odd = [{ id: 'x', type_code: 'LIGHT', status: 'weird' }];
    const r = makeGroupMembershipResolver({ components: odd, types })({ type_codes: ['LIGHT'] });
    expect(r.total).toBe(1);
    expect(r.byStatus).toEqual({ ok: 0, problem: 0, failed: 0, inactive: 0 });
  });

  it('resolveGroupMembership one-shot matches the factory', () => {
    const r = resolveGroupMembership({ type_codes: ['LIFT'] }, ctx);
    expect(r.componentIds.sort()).toEqual(['c4', 'c5']);
  });
});
