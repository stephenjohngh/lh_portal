// src/lib/apps/building_assets/stores/worksSchedulesStore.test.js
//
// The store contract for works schedules — which DB calls each method makes.
//
// applyChanges is the one that matters: it writes to `components`, which every
// other app in the portal reads. These tests are mostly about what it does when
// something goes wrong halfway, because a schedule half carried out is a real
// state, not an error.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve([])),
    getAllIn: vi.fn(() => Promise.resolve([])),
    create: vi.fn((t, d) => Promise.resolve({ id: 'new', ...d })),
    createMany: vi.fn(() => Promise.resolve([])),
    update: vi.fn((t, id, d) => Promise.resolve({ id, ...d })),
    updateMany: vi.fn(() => Promise.resolve([])),
    delete: vi.fn(() => Promise.resolve()),
  },
  replaceComponentAttributes: vi.fn(() => Promise.resolve([])),
  logAudit: vi.fn(),
}));

vi.mock('$lib/utils/api', () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('../public.js', () => ({
  replaceComponentAttributes: h.replaceComponentAttributes,
}));
vi.mock('$app/environment', () => ({ browser: false, dev: false }));

const { worksSchedulesStore } = await import('./worksSchedulesStore.js');

const change = (over = {}) => ({
  item: { id: 'i1' },
  component: { id: 'c1', asset_id: 'L-101', status: 'failed', type_code: 'LGT-FL' },
  patch: { status: 'ok', updated_by: 'u1' },
  attrs: null,
  ...over,
});

beforeEach(() => { vi.clearAllMocks(); });

describe('createSchedule', () => {
  it('creates the schedule then its lines', async () => {
    await worksSchedulesStore.createSchedule(
      { title: 'Lighting upgrade', purpose: 'quote' }, ['c1', 'c2'], 'u1');

    expect(h.api.create).toHaveBeenCalledWith('works_schedules',
      expect.objectContaining({ title: 'Lighting upgrade', status: 'draft', created_by: 'u1' }),
      true);
    expect(h.api.createMany).toHaveBeenCalledWith('works_schedule_items',
      expect.arrayContaining([expect.objectContaining({ component_id: 'c1' })]), false);
  });

  it('starts as a draft whatever it will become', async () => {
    await worksSchedulesStore.createSchedule({ title: 'x', purpose: 'works' }, [], 'u1');
    expect(h.api.create.mock.calls[0][1].status).toBe('draft');
  });
});

describe('addItems', () => {
  it('skips components already on the schedule', async () => {
    // Adding a filtered list twice is an ordinary thing to do, and the unique
    // index would otherwise fail the whole batch over one duplicate.
    h.api.get.mockResolvedValueOnce([{ component_id: 'c1' }]);

    await worksSchedulesStore.addItems('s1', ['c1', 'c2'], 'replace', 'u1');

    const rows = h.api.createMany.mock.calls[0][1];
    expect(rows.map(r => r.component_id)).toEqual(['c2']);
  });

  it('de-duplicates the incoming list too', async () => {
    await worksSchedulesStore.addItems('s1', ['c1', 'c1', 'c2'], 'replace', 'u1');
    expect(h.api.createMany.mock.calls[0][1].map(r => r.component_id)).toEqual(['c1', 'c2']);
  });

  it('writes nothing when every component is already there', async () => {
    h.api.get.mockResolvedValueOnce([{ component_id: 'c1' }]);
    await worksSchedulesStore.addItems('s1', ['c1'], 'replace', 'u1');
    expect(h.api.createMany).not.toHaveBeenCalled();
  });

  it('continues the position numbering from what is already there', async () => {
    h.api.get.mockResolvedValueOnce([{ component_id: 'c0' }, { component_id: 'c9' }]);
    await worksSchedulesStore.addItems('s1', ['c1'], 'replace', 'u1');
    expect(h.api.createMany.mock.calls[0][1][0].position).toBe(2);
  });
});

describe('loadItems', () => {
  it('joins every component column the schedule VIEW needs', () => {
    // A joined select names its columns, so one that is never asked for is
    // simply absent at the far end and reads as data that is not set. That is
    // how x_position/y_position went missing: the plan peek drew the floor plan
    // correctly and then reported "no position set" for every asset.
    //
    // Pinned as a list because the failure is silent — nothing errors, a
    // feature just quietly shows the wrong thing.
    return worksSchedulesStore.loadItems('s1').then(() => {
      const select = h.api.get.mock.calls[0][1].select;
      for (const column of [
        'id', 'asset_id', 'label', 'type_code', 'status',
        'floor_id', 'plan_id', 'x_position', 'y_position',
      ]) {
        expect(select).toContain(column);
      }
    });
  });

  it('orders lines by position, so the schedule reads as it was built', () => {
    return worksSchedulesStore.loadItems('s1').then(() => {
      expect(h.api.get.mock.calls[0][1]).toMatchObject({
        orderBy: 'position', ascending: true,
      });
    });
  });

  it('clears the open schedule when asked for nothing', () => {
    return worksSchedulesStore.loadItems(null).then((items) => {
      expect(items).toEqual([]);
      expect(h.api.get).not.toHaveBeenCalled();
    });
  });
});

describe('applyChanges', () => {
  it('writes the component, stamps the line, and audits against the ASSET', async () => {
    const result = await worksSchedulesStore.applyChanges([change()], 'u1');

    expect(h.api.update).toHaveBeenCalledWith('components', 'c1',
      { status: 'ok', updated_by: 'u1' }, false);
    expect(h.api.update).toHaveBeenCalledWith('works_schedule_items', 'i1',
      expect.objectContaining({ applied_by: 'u1' }), false);
    // "What has happened to this asset" is asked of the asset, so that is what
    // the audit entry is keyed on.
    expect(h.logAudit).toHaveBeenCalledWith(
      'update', 'component', 'c1', 'L-101', expect.anything());
    expect(result).toEqual({ applied: 1, failed: [] });
  });

  it('writes attributes through the app-s own helper, not a raw table call', async () => {
    await worksSchedulesStore.applyChanges(
      [change({ attrs: { wattage: '15', circuit: 'L3' } })], 'u1');

    expect(h.replaceComponentAttributes).toHaveBeenCalledWith(
      'c1', { wattage: '15', circuit: 'L3' });
  });

  it('applies a line whose only change is its attributes', async () => {
    await worksSchedulesStore.applyChanges([change({ patch: null, attrs: { wattage: '15' } })], 'u1');

    expect(h.replaceComponentAttributes).toHaveBeenCalled();
    // No component patch, but the LINE is still marked applied — otherwise it
    // would come back as outstanding for ever.
    expect(h.api.update).toHaveBeenCalledWith('works_schedule_items', 'i1',
      expect.objectContaining({ applied_at: expect.any(String) }), false);
  });

  it('keeps going after one line fails, and says which', async () => {
    // A schedule half carried out is a real state — work comes back in parts.
    // Failing the batch would lose the lines that succeeded.
    h.api.update.mockRejectedValueOnce(new Error('component gone'));

    const result = await worksSchedulesStore.applyChanges(
      [change({ item: { id: 'i1' } }), change({ item: { id: 'i2' } })], 'u1');

    expect(result.applied).toBe(1);
    expect(result.failed).toEqual([{ item: { id: 'i1' }, error: 'component gone' }]);
  });

  it('does not mark a line applied when its component write failed', async () => {
    h.api.update.mockRejectedValueOnce(new Error('nope'));

    await worksSchedulesStore.applyChanges([change()], 'u1');

    // Only the failed component call was made; no stamp followed it.
    const stamps = h.api.update.mock.calls.filter(c => c[0] === 'works_schedule_items');
    expect(stamps).toHaveLength(0);
  });

  it('stamps every line with the SAME timestamp', async () => {
    // One act of applying, one moment. Per-line clock reads would make a batch
    // look like a sequence of separate decisions.
    await worksSchedulesStore.applyChanges(
      [change({ item: { id: 'i1' } }), change({ item: { id: 'i2' } })], 'u1');

    const stamps = h.api.update.mock.calls
      .filter(c => c[0] === 'works_schedule_items')
      .map(c => c[2].applied_at);
    expect(new Set(stamps).size).toBe(1);
  });
});

describe('issueSchedule / completeSchedule', () => {
  it('issuing records when it went out', async () => {
    await worksSchedulesStore.issueSchedule('s1', 'u1');
    const patch = h.api.update.mock.calls[0][2];
    expect(patch.status).toBe('issued');
    expect(patch.issued_at).toEqual(expect.any(String));
  });

  it('completing records when the work finished', async () => {
    await worksSchedulesStore.completeSchedule('s1', 'u1');
    const patch = h.api.update.mock.calls[0][2];
    expect(patch.status).toBe('completed');
    expect(patch.completed_at).toEqual(expect.any(String));
  });
});

describe('setActionForAll', () => {
  it('filters by schedule, not by a list of ids', async () => {
    // api.updateMany filters with .eq per key — an array would become
    // .eq('id', [...]) and match nothing.
    await worksSchedulesStore.setActionForAll('s1', 'remove', 'u1');

    expect(h.api.updateMany).toHaveBeenCalledWith('works_schedule_items',
      { schedule_id: 's1' }, expect.objectContaining({ action: 'remove' }), false);
  });
});
