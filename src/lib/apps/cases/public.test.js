// Cases' deadlines for the Planner: every Cases process's open deadlines,
// named by process, reference and step — never a case's title or fields — and
// an overdue one stays in view (bounded at `to` only).
import { describe, it, expect, vi } from 'vitest';

vi.mock('#lib/utils/api.js', () => ({
  api: { getAll: vi.fn(async () => [{ id: 'w1', key: 'case_change' }, { id: 'w2', key: 'case_triage' }]) },
}));
vi.mock('#lib/workflow/workflowApi.js', () => ({
  listDeadlines: vi.fn(async (/** @type {string} */ key) => key === 'case_change'
    ? [{ id: 'i1', label: 'CAS-2026-000001', due_on: '2020-01-01', step: 'Open', workflow: 'Change control' },
       { id: 'i2', label: 'CAS-2026-000002', due_on: '2099-01-01', step: 'Open', workflow: 'Change control' }]
    : [{ id: 'i3', label: 'CAS-2026-000003', due_on: '2026-11-01', step: 'Triage', workflow: 'Concern triage' }]),
}));

const { listCaseDueDates } = await import('./public.js');

describe('listCaseDueDates', () => {
  it('reads every process, keeps the overdue, drops what is past `to`', async () => {
    const rows = await listCaseDueDates('2026-12-31');
    expect(rows.map((r) => r.id)).toEqual(['case:i1', 'case:i3']);
    expect(rows[0]).toMatchObject({ title: 'Change control CAS-2026-000001 — Open', overdue: true });
    expect(rows[1].overdue).toBe(false);
  });
});
