// src/lib/apps/compliance/complianceReviewDates.test.js
//
// compliance/public.js listComplianceReviewDates — review dates this app
// records, for the Planner.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ tables: {} }));
vi.mock('$lib/utils/api', () => ({
  api: { get: vi.fn(async (table) => h.tables[table] ?? []) },
}));
vi.mock('./stores/inspectionDefinitionsStore.js', () => ({ inspectionDefinitionsStore: {} }));
vi.mock('$lib/apps/inspection/public.js', () => ({ listWalkSessions: vi.fn(async () => []) }));
vi.mock('$lib/apps/maintenance/public.js', () => ({ listJobEvidence: vi.fn(async () => []) }));

import { listComplianceReviewDates } from './public.js';

beforeEach(() => { h.tables = {}; });

describe('listComplianceReviewDates', () => {
  it('includes a display item review, overdue ones too, and not a removed item', async () => {
    h.tables.display_items = [
      { id: 'a', title: 'BAC', status: 'displayed', review_date: '2025-01-01' },
      { id: 'b', title: 'Old notice', status: 'removed', review_date: '2026-10-01' },
      { id: 'c', title: 'Far', status: 'displayed', review_date: '2029-01-01' },
    ];
    const rows = await listComplianceReviewDates('2026-12-31');
    expect(rows.map((r) => r.id)).toEqual(['a']);
    expect(rows[0].title).toMatch(/BAC/);
  });

  // Only the LATEST decision counts: a duty excluded and then re-applied has
  // nothing left to review.
  it('uses only the current not-applicable decision for each duty', async () => {
    h.tables.statutory_exclusions = [
      { id: 'x2', template_key: 'fra_refresh', decision: 'applicable', decided_at: '2026-06-01', review_due: null },
      { id: 'x1', template_key: 'fra_refresh', decision: 'not_applicable', decided_at: '2026-01-01', review_due: '2026-10-01' },
      { id: 'y1', template_key: 'ev_charging_inspection', decision: 'not_applicable', decided_at: '2026-01-01', review_due: '2026-11-01' },
    ];
    const rows = await listComplianceReviewDates('2026-12-31');
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('exclusion');
    expect(rows[0].date).toBe('2026-11-01');
    // Named by the register entry, never shown as a raw key.
    expect(rows[0].title).not.toMatch(/ev_charging_inspection/);
  });
});
