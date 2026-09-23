// compliance/public.js listObligationDueDates — the ONE place "what is due"
// is answered (user, 2026-09-23: "it gets its data from one place").
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  obligations: [], sessions: [], jobs: [], jobsFail: false,
}));

vi.mock('$lib/utils/api', () => ({
  api: { get: vi.fn(async () => h.obligations) },
}));
vi.mock('./stores/inspectionDefinitionsStore.js', () => ({ inspectionDefinitionsStore: {} }));
vi.mock('$lib/apps/inspection/public.js', () => ({ listWalkSessions: vi.fn(async () => h.sessions) }));
vi.mock('$lib/apps/maintenance/public.js', () => ({
  listJobEvidence: vi.fn(async () => { if (h.jobsFail) throw new Error('boom'); return h.jobs; }),
}));

import { listObligationDueDates } from './public.js';

const ob = (over) => ({ id: 'o1', name: 'Alarm service', evidenced_by: 'maintenance_job',
  frequency_days: 365, active: true, retired_on: null, ...over });

describe('listObligationDueDates', () => {
  beforeEach(() => { h.obligations = []; h.sessions = []; h.jobs = []; h.jobsFail = false; });

  it('says a duty with a scheduled job is booked', async () => {
    h.obligations = [ob()];
    h.jobs = [{ id: 'j1', obligation_id: 'o1', status: 'scheduled', scheduled_date: '2099-01-01' }];
    const [row] = await listObligationDueDates();
    expect(row.booked).toBe(true);
    expect(row.nextDue.slice(0, 10)).toBe('2099-01-01');
  });

  it('says a duty with no job is not booked', async () => {
    h.obligations = [ob()];
    const [row] = await listObligationDueDates();
    expect(row.booked).toBe(false);
    expect(row.band).toBe('never_run');
  });

  it('leaves out a retired planned obligation', async () => {
    h.obligations = [ob({ retired_on: '2026-01-01' })];
    expect(await listObligationDueDates()).toEqual([]);
  });

  // ⛔ A due date computed without the jobs would call every contractor duty
  // overdue. It must fail, not answer with half the evidence.
  it('rejects rather than returning a partial answer when jobs cannot be read', async () => {
    h.obligations = [ob()];
    h.jobsFail = true;
    await expect(listObligationDueDates()).rejects.toThrow();
  });
});
