// src/lib/apps/building_assets/utils/worksSchedule.test.js
//
// What a works-schedule action means when the work comes back.
//
// This is the risky half of the feature: applying a schedule WRITES to asset
// records, and a wrong automatic change is worse than no change. So the tests
// are mostly about what it declines to do.

import { describe, it, expect } from 'vitest';
import {
  WORKS_ACTIONS, actionDef, actionLabel, applyPatch, attributePatch, planApply,
  actionSummary, describeSummary, appliedProgress, purposeLabel, statusLabel, specSuggestions, countMatchingLines, specUsage } from './worksSchedule.js';

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

describe('attributePatch', () => {
  it('MERGES over what the component already has', () => {
    // The write path deletes every attribute row and re-inserts what it is
    // given. Handing it only the changed value would erase the rest — fit a new
    // light, lose its fire rating and its circuit reference.
    const current = { wattage: '40', circuit: 'L3', fire_rating: 'FD30' };
    const patch = attributePatch(item({ target_attributes: { wattage: '15' } }), current);

    expect(patch).toEqual({ wattage: '15', circuit: 'L3', fire_rating: 'FD30' });
  });

  it('is null when the value is already what was specified', () => {
    expect(attributePatch(
      item({ target_attributes: { wattage: '15' } }), { wattage: '15' })).toBeNull();
  });

  it('compares as text, so 15 and "15" are the same value', () => {
    expect(attributePatch(
      item({ target_attributes: { wattage: 15 } }), { wattage: '15' })).toBeNull();
  });

  it('adds an attribute the component did not have', () => {
    expect(attributePatch(item({ target_attributes: { wattage: '15' } }), {}))
      .toEqual({ wattage: '15' });
  });

  it('is null when the item specifies no attributes', () => {
    expect(attributePatch(item(), { wattage: '40' })).toBeNull();
    expect(attributePatch(item({ target_attributes: {} }), {})).toBeNull();
  });
});

describe('planApply — attributes', () => {
  const components = [component({ id: 'c1', type_code: 'LGT-FL', status: 'failed' })];
  const attributes = { c1: { wattage: '40', circuit: 'L3' } };

  it('carries the new attribute values alongside the type change', () => {
    // Fitting a 15W LED where a 40W fluorescent was changes the register, not
    // just the fitting.
    const plan = planApply([
      item({ action: 'replace', target_type_code: 'LGT-LED',
             target_attributes: { wattage: '15' } }),
    ], components, { ...ctx, attributes });

    expect(plan.changes[0].patch.type_code).toBe('LGT-LED');
    expect(plan.changes[0].attrs).toEqual({ wattage: '15', circuit: 'L3' });
  });

  it('ignores stray attributes on an action that fits nothing', () => {
    // A 'leave' line is listed for information. It must not quietly rewrite the
    // register on its way past.
    const plan = planApply([
      item({ action: 'leave', target_attributes: { wattage: '15' } }),
    ], components, { ...ctx, attributes });

    expect(plan.changes).toEqual([]);
    expect(plan.unchanged).toHaveLength(1);
  });

  it('counts a line as a change when ONLY its attributes differ', () => {
    // Same type, same status, new wattage — still work that must be recorded.
    const plan = planApply([
      item({ action: 'replace', target_type_code: 'LGT-FL',
             target_attributes: { wattage: '15' } }),
    ], [component({ id: 'c1', type_code: 'LGT-FL', status: 'ok' })],
       { ...ctx, attributes });

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].patch).toBeNull();
    expect(plan.changes[0].attrs).toEqual({ wattage: '15', circuit: 'L3' });
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

describe('specSuggestions', () => {
  const rows = [
    { spec: '18W LED batten, 4000K',   target_type_code: 'LIGHT_LED' },
    { spec: '18W LED batten, 4000K',   target_type_code: 'LIGHT_LED' },
    { spec: '18W LED batten, 4000K',   target_type_code: 'LIGHT_LED' },
    { spec: '18W LED battne, 4000K',   target_type_code: 'LIGHT_LED' },  // typo, once
    { spec: 'FD30S, intumescent seal', target_type_code: 'DOOR_FD' },
    { spec: '  ',                      target_type_code: 'LIGHT_LED' },
    { spec: null,                      target_type_code: null },
  ];

  it('offers wordings written for the type being fitted first', () => {
    expect(specSuggestions(rows, 'DOOR_FD')[0]).toBe('FD30S, intumescent seal');
    expect(specSuggestions(rows, 'LIGHT_LED')[0]).toBe('18W LED batten, 4000K');
  });

  it('sinks a wording used once below one used often', () => {
    const out = specSuggestions(rows, 'LIGHT_LED');
    expect(out.indexOf('18W LED batten, 4000K'))
      .toBeLessThan(out.indexOf('18W LED battne, 4000K'));
  });

  it('offers each wording once, however many lines use it', () => {
    const out = specSuggestions(rows, 'LIGHT_LED');
    expect(out.filter(x => x === '18W LED batten, 4000K')).toHaveLength(1);
  });

  it('leaves out withdrawn wordings entirely', () => {
    // Sinking a mistake is not the same as removing it.
    expect(specSuggestions(rows, 'LIGHT_LED', ['18W LED battne, 4000K']))
      .not.toContain('18W LED battne, 4000K');
  });

  it('leaves out blank and missing specifications', () => {
    expect(specSuggestions(rows, null).sort()).toEqual([
      '18W LED batten, 4000K', '18W LED battne, 4000K', 'FD30S, intumescent seal',
    ]);
  });

  it('survives having nothing to offer', () => {
    expect(specSuggestions(undefined, 'X')).toEqual([]);
    expect(specSuggestions([], 'X')).toEqual([]);
  });
});

describe('specUsage', () => {
  const schedules = [
    { id: 's1', title: 'Landing lights', status: 'draft' },
    { id: 's2', title: 'Stair doors',    status: 'issued' },
  ];
  const rows = [
    { spec: 'LED batten', schedule_id: 's1' },
    { spec: 'LED batten', schedule_id: 's1' },
    { spec: 'FD30S',      schedule_id: 's2' },
    { spec: 'Mixed',      schedule_id: 's1' },
    { spec: 'Mixed',      schedule_id: 's2' },
    { spec: '   ',        schedule_id: 's1' },
  ];

  it('counts the lines behind each wording, most used first', () => {
    const usage = specUsage(rows, schedules);
    expect(usage.map(u => [u.spec, u.count])).toEqual([
      ['LED batten', 2], ['Mixed', 2], ['FD30S', 1],
    ]);
  });

  it('names the schedules a wording appears on, once each', () => {
    const led = specUsage(rows, schedules).find(u => u.spec === 'LED batten');
    expect(led.schedules).toEqual([{ id: 's1', title: 'Landing lights', status: 'draft' }]);
  });

  it('lets a draft-only wording be corrected', () => {
    expect(specUsage(rows, schedules).find(u => u.spec === 'LED batten').renameable).toBe(true);
  });

  it('refuses to correct a wording used on an issued schedule', () => {
    // That is the document a contractor holds; rewriting it would leave the
    // register disagreeing with the paper.
    expect(specUsage(rows, schedules).find(u => u.spec === 'FD30S').renameable).toBe(false);
    expect(specUsage(rows, schedules).find(u => u.spec === 'Mixed').renameable).toBe(false);
  });

  it('refuses to correct a wording whose schedule is not loaded', () => {
    const orphan = [{ spec: 'Unknown home', schedule_id: 'gone' }];
    expect(specUsage(orphan, schedules)[0].renameable).toBe(false);
  });

  it('marks the withdrawn ones', () => {
    const usage = specUsage(rows, schedules, ['FD30S']);
    expect(usage.find(u => u.spec === 'FD30S').hidden).toBe(true);
    expect(usage.find(u => u.spec === 'Mixed').hidden).toBe(false);
  });

  it('ignores blank specifications', () => {
    expect(specUsage(rows, schedules).map(u => u.spec)).not.toContain('   ');
  });
});

describe('countMatchingLines', () => {
  const items = [
    { action: 'replace', target_type_code: 'LIGHT_LED' },
    { action: 'replace', target_type_code: 'LIGHT_LED' },
    { action: 'replace', target_type_code: 'LIGHT_EM'  },
    { action: 'remove',  target_type_code: null        },
    { action: 'remove',  target_type_code: null        },
    { action: 'replace', target_type_code: 'LIGHT_LED', applied_at: '2026-08-18T09:00:00Z' },
  ];

  it('counts only lines fitting the same thing', () => {
    expect(countMatchingLines(items,
      { action: 'replace', target_type_code: 'LIGHT_LED' })).toBe(2);
  });

  it('ignores the replacement type where the action does not fit anything', () => {
    // Removing is one instruction whatever the assets are; there is nothing
    // being put in to differ.
    expect(countMatchingLines(items,
      { action: 'remove', target_type_code: null })).toBe(2);
  });

  it('leaves out work already carried out', () => {
    // The applied line is a sixth row and would otherwise make it three.
    expect(countMatchingLines(items,
      { action: 'replace', target_type_code: 'LIGHT_LED' })).toBe(2);
  });

  it('counts nothing when the answer matches nothing', () => {
    expect(countMatchingLines(items,
      { action: 'repair', target_type_code: null })).toBe(0);
    expect(countMatchingLines(undefined, { action: 'remove' })).toBe(0);
  });
});
