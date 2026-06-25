// src/lib/apps/building_assets/public.test.js
// The Building Assets PUBLIC interface is the cross-app contract for components
// (used by the app's own store AND by the Inspection app). These tests pin the
// behaviour other apps depend on: the read, the canonical update + updated_by
// stamp, the "inspection result → component status" rule (the full patch it
// writes), and the delete-then-insert attribute replacement with its filtering.
// Seam mocked: $lib/utils/api.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: {
    getById:    vi.fn(() => Promise.resolve({ id: 'c1' })),
    update:     vi.fn((_t, id, fields) => Promise.resolve({ id, ...fields })),
    deleteMany: vi.fn(() => Promise.resolve()),
    createMany: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('$lib/utils/api', () => ({ api: h.api }));

const { getComponent, updateComponent, applyInspectionResult, replaceComponentAttributes } =
  await import('./public.js');

beforeEach(() => vi.clearAllMocks());

describe('getComponent', () => {
  it('reads the components table by id', async () => {
    h.api.getById.mockResolvedValueOnce({ id: 'c1', label: 'FD-01' });
    const c = await getComponent('c1');
    expect(h.api.getById).toHaveBeenCalledWith('components', 'c1');
    expect(c).toEqual({ id: 'c1', label: 'FD-01' });
  });
});

describe('updateComponent', () => {
  it('stamps updated_by and writes the components table, returning the row', async () => {
    const row = await updateComponent('c1', { label: 'FD-02' }, 'user-9');
    expect(h.api.update).toHaveBeenCalledWith('components', 'c1', { label: 'FD-02', updated_by: 'user-9' });
    expect(row).toMatchObject({ id: 'c1', label: 'FD-02', updated_by: 'user-9' });
  });
});

describe('applyInspectionResult — the cross-app status rule', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z')); });
  afterEach(() => vi.useRealTimers());

  it('writes the full, consistent patch (status, last_inspection_id, status_set_by/at, updated_by)', async () => {
    const patch = await applyInspectionResult('c1', { result: 'failed', inspectionId: 'insp-7', userId: 'user-9' });

    const expected = {
      status:             'failed',
      last_inspection_id: 'insp-7',
      status_set_by:      'user-9',
      status_set_at:      '2026-06-24T12:00:00.000Z',
      updated_by:         'user-9',
    };
    expect(h.api.update).toHaveBeenCalledWith('components', 'c1', expected);
    expect(patch).toEqual(expected);   // returned so the caller can update its own cache
  });

  it('always stamps status_set_by/at (the field the Inspection app used to omit)', async () => {
    await applyInspectionResult('c1', { result: 'ok', inspectionId: 'insp-1', userId: 'u1' });
    const written = h.api.update.mock.calls[0][2];
    expect(written).toHaveProperty('status_set_by', 'u1');
    expect(written).toHaveProperty('status_set_at');
  });
});

describe('replaceComponentAttributes', () => {
  it('deletes the existing rows then inserts the non-empty values, and returns them', async () => {
    const rows = await replaceComponentAttributes('c1', { a: 'EI30', b: 'left' });
    expect(h.api.deleteMany).toHaveBeenCalledWith('component_attributes', { component_id: 'c1' });
    expect(h.api.createMany).toHaveBeenCalledWith('component_attributes', [
      { component_id: 'c1', type_attribute_id: 'a', value: 'EI30' },
      { component_id: 'c1', type_attribute_id: 'b', value: 'left' },
    ], false);
    expect(rows).toHaveLength(2);
  });

  it('filters out empty / null / undefined values', async () => {
    await replaceComponentAttributes('c1', { a: 'EI30', b: '', c: null, d: undefined });
    expect(h.api.createMany.mock.calls[0][1]).toEqual([
      { component_id: 'c1', type_attribute_id: 'a', value: 'EI30' },
    ]);
  });

  it('coerces values to strings', async () => {
    await replaceComponentAttributes('c1', { a: 30 });
    expect(h.api.createMany.mock.calls[0][1][0].value).toBe('30');
  });

  it('still clears (delete) but does not insert when every value is empty', async () => {
    const rows = await replaceComponentAttributes('c1', { a: '', b: null });
    expect(h.api.deleteMany).toHaveBeenCalledOnce();
    expect(h.api.createMany).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });
});
