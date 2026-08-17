// src/lib/apps/building_assets/utils/worksSchedule.test.js
//
// What a works-schedule action means when the work comes back.
//
// This is the risky half of the feature: applying a schedule WRITES to asset
// records, and a wrong automatic change is worse than no change. So the tests
// are mostly about what it declines to do.

import { describe, it, expect } from 'vitest';
import {
  WORKS_ACTIONS, actionDef, actionLabel, applyPatch, planApply,
  actionSummary, describeSummary, appliedProgress, purposeLabel, statusLabel,
} from './worksSchedule.js';

const item = (over = {}) => ({
  id: 'i1', component_id: 'c1', action: 'replace', target_type_code: null,
  applied_at: null, ...over,
});
const component = (over = {}) => ({
  id: 'c1', type_code: 'LGT-FL', status: 'failed', ...over,
});
const ctx = { userId: 'u1', at: '2026-08-17T10:00:00Z' };

describe('applyPatch — replace', () => {
  it('sets the component working again and stamps who said so', () => {
    const patch = applyPatch(item(), component(), ctx);

    expect(patch).toMatchObject({
      status: 'ok', status_set_by: 'u1', status_set_at: ctx.at, updated_by: 'u1',
    });
  });

  it('re-types the component when a replacement type was specified', () => {
    // The asset row survives the replacement, so its location, its asset id and
    // its inspection history all survive with it. That is the reason not to
    // delete and re-create.
    const patch = applyPatch(
      item({ target_type_code: 'LGT-LED' }), component(), ctx);

    expect(patch.type_code).toBe('LGT-LED');
  });

  it('does not re-type when the replacement is the same type', () => {
    const patch = applyPatch(
      item({ target_type_code: 'LGT-FL' }), component({ type_code: 'LGT-FL' }), ctx);

    expect(patch).not.toHaveProperty('type_code');
  });
});

describe('applyPatch — the other actions', () => {
  it('remove makes the component inactive, never deletes it', () => {
    // A removed component is evidence that something used to be there.
    const patch = applyPatch(item({ action: 'remove' }), component(), ctx);
    expect(patch.status).toBe('inactive');
  });

  it('repair sets it working without changing its type', () => {
    const patch = applyPatch(
      item({ action: 'repair', target_type_code: 'LGT-LED' }), component(), ctx);

    expect(patch.status).toBe('ok');
    expect(patch).not.toHaveProperty('type_code');
  });

  it('relocate proposes NOTHING', () => {
    // Where it moved to is a position on a plan, which cannot be inferred from
    // a schedule. Guessing would write a wrong asset record.
    expect(applyPatch(item({ action: 'relocate' }), component(), ctx)).toBeNull();
  });

  it('leave proposes nothing', () => {
    expect(applyPatch(item({ action: 'leave' }), component(), ctx)).toBeNull();
  });

  it('proposes nothing when the component is already in the target state', () => {
    // Returning null rather than an empty patch keeps the preview honest: the
    // caller counts what will change.
    expect(applyPatch(item({ action: 'repair' }), component({ status: 'ok' }), ctx))
      .toBeNull();
  });

  it('is null for an unknown action or a missing component', () => {
    expect(applyPatch(item({ action: 'demolish' }), component(), ctx)).toBeNull();
    expect(applyPatch(item(), null, ctx)).toBeNull();
  });
});

describe('planApply', () => {
  const components = [
    component({ id: 'c1', status: 'failed' }),
    component({ id: 'c2', status: 'failed' }),
    component({ id: 'c3', status: 'ok' }),
  ];

  it('separates what will change from what will not', () => {
    const plan = planApply([
      item({ id: 'i1', component_id: 'c1', action: 'replace' }),
      item({ id: 'i2', component_id: 'c3', action: 'repair' }),   // already ok
      item({ id: 'i3', component_id: 'c2', action: 'leave' }),
    ], components, ctx);

    expect(plan.changes.map(c => c.item.id)).toEqual(['i1']);
    expect(plan.unchanged.map(i => i.id)).toEqual(['i2', 'i3']);
  });

  it('SKIPS lines already applied, so running it twice is safe', () => {
    // Work comes back in parts; this will be run more than once.
    const plan = planApply([
      item({ id: 'i1', component_id: 'c1', applied_at: '2026-08-01T00:00:00Z' }),
      item({ id: 'i2', component_id: 'c2' }),
    ], components, ctx);

    expect(plan.changes.map(c => c.item.id)).toEqual(['i2']);
  });

  it('reports a line whose component has gone rather than dropping it', () => {
    const plan = planApply([item({ id: 'i9', component_id: 'deleted' })], components, ctx);

    expect(plan.changes).toEqual([]);
    expect(plan.missing.map(i => i.id)).toEqual(['i9']);
  });

  it('accepts a Map as well as an array', () => {
    const byId = new Map(components.map(c => [c.id, c]));
    expect(planApply([item()], byId, ctx).changes).toHaveLength(1);
  });

  it('is empty for an empty schedule', () => {
    expect(planApply([], components, ctx))
      .toEqual({ changes: [], unchanged: [], missing: [] });
  });
});

describe('actionSummary / describeSummary', () => {
  it('counts by action in the order the actions are defined', () => {
    const items = [
      item({ action: 'remove' }), item({ action: 'replace' }),
      item({ action: 'replace' }), item({ action: 'remove' }),
    ];
    expect(actionSummary(items)).toEqual([
      { action: 'replace', label: 'Replace', count: 2 },
      { action: 'remove',  label: 'Remove',  count: 2 },
    ]);
  });

  it('reads as the size of the job — the first line a contractor sees', () => {
    expect(describeSummary([
      item({ action: 'replace' }), item({ action: 'replace' }),
      item({ action: 'remove' }),
    ])).toBe('Replace 2 · Remove 1');
  });

  it('says so plainly when there is nothing', () => {
    expect(describeSummary([])).toBe('No items');
  });
});

describe('appliedProgress', () => {
  it('counts how much has been carried out', () => {
    expect(appliedProgress([
      item({ applied_at: '2026-08-01' }), item(), item(),
    ])).toEqual({ done: 1, total: 3, complete: false });
  });

  it('is complete only when every line is applied', () => {
    expect(appliedProgress([item({ applied_at: 'x' })]).complete).toBe(true);
    // An empty schedule is not "complete" — there was nothing to do.
    expect(appliedProgress([]).complete).toBe(false);
  });
});

describe('labels', () => {
  it('names the document by what it IS when printed', () => {
    // A contractor needs to know whether they are holding a price request or an
    // instruction to start.
    expect(purposeLabel('quote')).toBe('Request for quotation');
    expect(purposeLabel('works')).toBe('Instruction to proceed');
    expect(purposeLabel(undefined)).toBe('Schedule of works');
  });

  it('falls back to the raw value rather than showing nothing', () => {
    expect(statusLabel('draft')).toBe('Draft');
    expect(statusLabel('something-new')).toBe('something-new');
    expect(actionLabel('replace')).toBe('Replace');
    expect(actionLabel(undefined)).toBe('—');
  });

  it('every action defines what applying it does', () => {
    // A new action without an `applies` rule would silently do nothing when a
    // schedule was marked carried out.
    for (const a of WORKS_ACTIONS) {
      expect(actionDef(a.value).applies).toBeDefined();
      expect(a.describe.length).toBeGreaterThan(0);
    }
  });
});
