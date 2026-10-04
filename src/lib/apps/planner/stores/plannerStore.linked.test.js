// plannerStore.loadLinked — an unreadable source must never look like an
// empty one. It used to return [] and only log, which is how a renamed column
// hid every maintenance job from the year without anybody noticing.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({ jobsFail: false, obligations: [], morFail: false, parkingFail: false, parkingCalls: 0 }));

vi.mock('#lib/utils/api.js', () => ({ api: {} }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('#lib/apps/maintenance/public.js', () => ({
  listScheduledWork: vi.fn(async () => { if (h.jobsFail) throw new Error('column does not exist'); return []; }),
  createJobFromPlanner: vi.fn(),
  listCertificateExpiries: vi.fn(async () => []),
}));
vi.mock('#lib/apps/management/public.js', () => ({
  listMeetings: vi.fn(async () => []), listOpenActionDeadlines: vi.fn(async () => []),
}));
vi.mock('#lib/apps/golden_thread/public.js', () => ({
  listReviewsDue: vi.fn(async () => []),
  listRiskReviewsDue: vi.fn(async () => []),
  listCompetenceExpiries: vi.fn(async () => []),
}));
vi.mock('#lib/apps/compliance/public.js', () => ({
  listObligationDueDates: vi.fn(async () => h.obligations),
  listComplianceReviewDates: vi.fn(async () => []),
}));
vi.mock('#lib/apps/mor/public.js', () => ({
  listBsrReportDeadlines: vi.fn(async () => {
    if (h.morFail) throw new Error('permission denied');
    return [{ id: 'm1', reference: 'MOR-1', deadline: '2026-09-30', decided: false }];
  }),
}));

vi.mock('#lib/apps/parking/public.js', () => ({
  listParkingDueDates: vi.fn(async () => {
    h.parkingCalls += 1;
    if (h.parkingFail) throw new Error('permission denied');
    return [{ id: 'end:a1', kind: 'ending', date: '2026-10-31', title: 'Agreement ends: PA-0001 · L/PK/22',
      detail: null, overdue: false, needsArranging: false }];
  }),
}));

import { plannerStore } from './plannerStore.js';

describe('plannerStore.loadLinked', () => {
  beforeEach(() => { h.jobsFail = false; h.obligations = []; h.morFail = false; h.parkingFail = false; h.parkingCalls = 0; });

  // Parking, 2026-09-26. A source not granted is never fetched, and one that
  // fails is named without emptying the rest.
  it('reads Parking only for someone with it, and shows its rows', async () => {
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['meeting']));
    expect(h.parkingCalls).toBe(0);
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['parking']));
    expect(h.parkingCalls).toBe(1);
    const row = get(plannerStore).linked.find(i => i.source === 'parking');
    expect(row.series.title).toBe('Agreement ends: PA-0001 · L/PK/22');
  });

  it('names Parking when it cannot be read, and still shows the others', async () => {
    h.parkingFail = true;
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['parking', 'mor_bsr']));
    const s = get(plannerStore);
    expect(s.linkedFailures).toEqual(['parking dates']);
    expect(s.linked.some(i => i.source === 'mor_bsr')).toBe(true);
  });

  it('names a source it could not read', async () => {
    h.jobsFail = true;
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['maintenance', 'meeting']));
    expect(get(plannerStore).linkedFailures).toEqual(['maintenance jobs']);
  });

  it('clears the failure once the source reads again', async () => {
    h.jobsFail = true;
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['maintenance']));
    h.jobsFail = false;
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['maintenance']));
    expect(get(plannerStore).linkedFailures).toEqual([]);
  });

  it('reads planned obligations only when that source is visible', async () => {
    const { listObligationDueDates } = await import('#lib/apps/compliance/public.js');
    listObligationDueDates.mockClear();
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['maintenance']));
    expect(listObligationDueDates).not.toHaveBeenCalled();
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['obligation']));
    expect(listObligationDueDates).toHaveBeenCalled();
  });

  it('reads a phase-2 source only when visible, and names it when it fails', async () => {
    const { listBsrReportDeadlines } = await import('#lib/apps/mor/public.js');
    listBsrReportDeadlines.mockClear();
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['maintenance']));
    expect(listBsrReportDeadlines).not.toHaveBeenCalled();

    const shown = await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['mor_bsr']));
    expect(shown.map((i) => i.source)).toEqual(['mor_bsr']);

    h.morFail = true;
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['mor_bsr']));
    expect(get(plannerStore).linkedFailures).toEqual(['MOR report deadlines']);
  });
});
