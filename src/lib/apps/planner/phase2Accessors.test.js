// src/lib/apps/planner/phase2Accessors.test.js
//
// The phase-2 Planner sources are computed in each OWNING app's public.js.
// These pin the rules that decide what is shown — each is a way the Planner
// could say "nothing due" while something is.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ tables: {} }));
vi.mock('$lib/utils/api', () => ({
  api: {
    get: vi.fn(async (table) => h.tables[table] ?? []),
    getAll: vi.fn(async (table) => h.tables[table] ?? []),
  },
}));

// Transitive imports reach the Supabase client and $env; neither is under test.
vi.mock('$lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://x', PUBLIC_SUPABASE_ANON_KEY: 'k' }));

import { listBsrReportDeadlines } from '$lib/apps/mor/public.js';
import { listCertificateExpiries } from '$lib/apps/maintenance/public.js';
import { listReviewsDue, listRiskReviewsDue, listCompetenceExpiries } from '$lib/apps/golden_thread/public.js';

beforeEach(() => { h.tables = {}; });

describe('MOR — listBsrReportDeadlines', () => {
  const kase = (over) => ({
    id: 'm1', reference: 'MOR-1', status: 'in_triage',
    identification_date: '2026-09-20T10:00:00Z', decision_outcome: null,
    bsr_report_submitted_at: null, ...over,
  });

  it('gives the deadline ten days after identification', async () => {
    h.tables.mor_cases = [kase()];
    const [row] = await listBsrReportDeadlines();
    expect(row.deadline).toBe('2026-09-30');
    expect(row.decided).toBe(false);
  });

  // The clock runs from identification whether or not anyone has decided yet.
  it('includes a case not yet decided', async () => {
    h.tables.mor_cases = [kase({ status: 'submitted' })];
    expect(await listBsrReportDeadlines()).toHaveLength(1);
  });

  it('leaves out submitted, closed and decided-not-reportable cases', async () => {
    h.tables.mor_cases = [
      kase({ id: 'a', bsr_report_submitted_at: '2026-09-25T00:00:00Z' }),
      kase({ id: 'b', status: 'closed' }),
      kase({ id: 'c', decision_outcome: 'no_action' }),
      kase({ id: 'd', decision_outcome: 'internal' }),
    ];
    expect(await listBsrReportDeadlines()).toEqual([]);
  });
});

describe('Maintenance — listCertificateExpiries', () => {
  it('keeps expired certificates and drops ones beyond the window', async () => {
    h.tables.maintenance_documents = [
      { id: 'old', expiry_date: '2025-01-01' },
      { id: 'soon', expiry_date: '2026-10-01' },
      { id: 'far', expiry_date: '2028-01-01' },
      { id: 'none', expiry_date: null },
    ];
    const rows = await listCertificateExpiries('2026-12-31');
    expect(rows.map((r) => r.id)).toEqual(['old', 'soon']);
  });
});

describe('Golden Thread — nothing overdue falls out of view', () => {
  // ⛔ This used to filter `>= from`, so last year's missed review vanished.
  it('listReviewsDue keeps a review that fell due before the window', async () => {
    h.tables.gt_documents = [{ id: 'd', review_due: '2025-06-01', status: 'current' }];
    expect(await listReviewsDue('2026-01-01', '2026-12-31')).toHaveLength(1);
  });

  it('listRiskReviewsDue leaves out closed and superseded risks', async () => {
    h.tables.gt_risks = [
      { id: 'a', status: 'assessed', review_due: '2026-10-01' },
      { id: 'b', status: 'closed', review_due: '2026-10-01' },
      { id: 'c', status: 'superseded', review_due: '2026-10-01' },
    ];
    expect((await listRiskReviewsDue('2026-12-31')).map((r) => r.id)).toEqual(['a']);
  });

  it('listCompetenceExpiries returns people with an expiry up to the window end', async () => {
    h.tables.gt_persons = [
      { id: 'a', competence_expiry: '2026-11-01' },
      { id: 'b', competence_expiry: null },
      { id: 'c', competence_expiry: '2029-01-01' },
    ];
    expect((await listCompetenceExpiries('2026-12-31')).map((p) => p.id)).toEqual(['a']);
  });
});
