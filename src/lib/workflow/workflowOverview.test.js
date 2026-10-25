import { describe, it, expect } from 'vitest';
import { workflowOverview, overviewTotals } from './workflowOverview.js';

const wfs = [{ id: 'w1', key: 'a', name: 'A', app_id: 'cases' }, { id: 'w2', key: 'b', name: 'B', app_id: 'cases' }];
const steps = [
  { workflow_id: 'w1', key: 'open', kind: 'start' }, { workflow_id: 'w1', key: 'wait', kind: 'open', pauses_clock: true },
  { workflow_id: 'w1', key: 'done', kind: 'done' }, { workflow_id: 'w2', key: 'open', kind: 'start' },
];
const today = '2026-10-25';

describe('workflowOverview', () => {
  it('counts open, late, with no one, paused, oldest and lately finished — per process', () => {
    const rows = workflowOverview({ workflows: wfs, steps, today, items: [
      { workflow_id: 'w1', step_key: 'open', due_on: '2026-10-20', assigned_to: 'u', started_at: '2026-10-01T10:00:00Z' },   // late
      { workflow_id: 'w1', step_key: 'open', due_on: '2026-12-31', assigned_to: null, started_at: '2026-10-20T10:00:00Z' }, // fine, no one
      { workflow_id: 'w1', step_key: 'wait', due_on: null, assigned_to: 'u', started_at: '2026-10-10T10:00:00Z' },           // paused
      { workflow_id: 'w1', step_key: 'done', updated_at: '2026-10-20T10:00:00Z' },                                            // lately finished
      { workflow_id: 'w1', step_key: 'done', updated_at: '2026-01-02T10:00:00Z' },                                            // long ago
    ] });
    expect(rows[0]).toMatchObject({ open: 3, overdue: 1, unassigned: 1, paused: 1, oldestDays: 24, finishedRecently: 1 });
    expect(rows[1]).toMatchObject({ open: 0, overdue: 0, oldestDays: null, finishedRecently: 0 });
  });

  it('sums a total across processes, and never names an item', () => {
    const rows = workflowOverview({ workflows: wfs, steps, today, items: [
      { workflow_id: 'w1', step_key: 'open', due_on: '2026-10-01', assigned_to: 'u' },
      { workflow_id: 'w2', step_key: 'open', due_on: '2026-10-02', assigned_to: null },
    ] });
    expect(overviewTotals(rows)).toMatchObject({ open: 2, overdue: 2, unassigned: 1 });
    expect(JSON.stringify(rows)).not.toMatch(/label|full_name/);
  });

  it('an item in a step that no longer exists is left out rather than miscounted', () => {
    const rows = workflowOverview({ workflows: wfs, steps, today, items: [{ workflow_id: 'w1', step_key: 'gone', due_on: '2026-10-01' }] });
    expect(rows[0].open).toBe(0);
  });
});
