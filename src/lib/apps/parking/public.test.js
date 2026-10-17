// parking/public.js — Parking's dated rows for the Planner. Online
// application deadlines (migration 248) join them, named by reference only.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ deadlines: /** @type {any[]} */ ([]), fail: false }));
vi.mock('#lib/utils/api.js', () => ({ api: { getAll: async () => [], get: async () => [] } }));
vi.mock('#lib/apps/building_assets/public.js', () => ({ listParkingBaySpaces: async () => [] }));
vi.mock('#lib/workflow/workflowApi.js', () => ({
  listDeadlines: async (key) => { expect(key).toBe('parking_application'); if (h.fail) throw new Error('no table'); return h.deadlines; },
}));

const { listParkingDueDates } = await import('./public.js');
beforeEach(() => { h.deadlines = []; h.fail = false; });

describe('listParkingDueDates — application deadlines', () => {
  it('an open application past its step’s deadline is an overdue row, named by its reference and step only', async () => {
    h.deadlines = [{ id: 'i1', label: 'PKR-2026-000012', due_on: '2000-01-03', step: 'Being checked', workflow: 'Parking application' }];
    const rows = await listParkingDueDates(null);
    expect(rows).toEqual([expect.objectContaining({ id: 'application:i1', date: '2000-01-03', overdue: true,
      title: 'Application PKR-2026-000012 — Being checked' })]);
  });
  it('one due after the Planner’s window is left out', async () => {
    h.deadlines = [{ id: 'i2', label: 'PKR-2026-000013', due_on: '2999-01-01', step: 'Received', workflow: 'x' }];
    expect(await listParkingDueDates('2030-01-01')).toEqual([]);
  });
  it('fails alone: no workflow, or a read that fails, is not a broken Planner', async () => {
    h.fail = true;
    expect(await listParkingDueDates(null)).toEqual([]);
  });
});
