// plannerStore.loadLinked — an unreadable source must never look like an
// empty one. It used to return [] and only log, which is how a renamed column
// hid every maintenance job from the year without anybody noticing.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({ jobsFail: false, obligations: [] }));

vi.mock('$lib/utils/api', () => ({ api: {} }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: vi.fn() }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$lib/apps/maintenance/public.js', () => ({
  listScheduledWork: vi.fn(async () => { if (h.jobsFail) throw new Error('column does not exist'); return []; }),
  createJobFromPlanner: vi.fn(),
}));
vi.mock('$lib/apps/management/public.js', () => ({
  listMeetings: vi.fn(async () => []), listOpenActionDeadlines: vi.fn(async () => []),
}));
vi.mock('$lib/apps/golden_thread/public.js', () => ({ listReviewsDue: vi.fn(async () => []) }));
vi.mock('$lib/apps/compliance/public.js', () => ({ listObligationDueDates: vi.fn(async () => h.obligations) }));

import { plannerStore } from './plannerStore.js';

describe('plannerStore.loadLinked', () => {
  beforeEach(() => { h.jobsFail = false; h.obligations = []; });

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
    const { listObligationDueDates } = await import('$lib/apps/compliance/public.js');
    listObligationDueDates.mockClear();
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['maintenance']));
    expect(listObligationDueDates).not.toHaveBeenCalled();
    await plannerStore.loadLinked('2026-01-01', '2026-12-31', new Set(['obligation']));
    expect(listObligationDueDates).toHaveBeenCalled();
  });
});
