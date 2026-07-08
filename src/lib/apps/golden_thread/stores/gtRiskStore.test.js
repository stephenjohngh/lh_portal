// src/lib/apps/golden_thread/stores/gtRiskStore.test.js
// Store-contract tests: mock the I/O seams (public.js risk accessors, api,
// supabase auth, auditLogger). The scoring/lifecycle pure logic is pinned by
// gtRiskScoring.test.js / gtRiskLifecycle.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const { api, getUser, logAudit, pub } = vi.hoisted(() => ({
  api: { getAllIn: vi.fn(async () => []) },
  getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
  logAudit: vi.fn(),
  pub: {
    listRisks: vi.fn(async () => []),
    getRisk: vi.fn(),
    createRisk: vi.fn(),
    updateRisk: vi.fn(),
    listRiskLinks: vi.fn(async () => []),
    listAllRiskLinks: vi.fn(async () => []),
    addRiskLink: vi.fn(),
    removeRiskLink: vi.fn(),
  },
}));

vi.mock('$lib/utils/api', () => ({ api }));
vi.mock('$lib/supabaseClient', () => ({ supabase: { auth: { getUser } } }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$lib/apps/golden_thread/public.js', () => pub);

import { gtRiskStore } from './gtRiskStore.js';

beforeEach(() => vi.clearAllMocks());

describe('gtRiskStore.load', () => {
  it('loads risks + links and computes no alerts when there are no links', async () => {
    pub.listRisks.mockResolvedValueOnce([{ id: 'r1', reference: 'RISK-0001', status: 'monitored' }]);
    pub.listAllRiskLinks.mockResolvedValueOnce([]);
    await gtRiskStore.load();
    const s = get(gtRiskStore);
    expect(s.risks).toHaveLength(1);
    expect(s.alertsByRisk).toEqual({});
    expect(api.getAllIn).not.toHaveBeenCalled();    // no links → no operational-record reads
  });

  it('computes per-risk live alert signals from linked records', async () => {
    pub.listRisks.mockResolvedValueOnce([{ id: 'r1', reference: 'RISK-0001', status: 'monitored' }]);
    pub.listAllRiskLinks.mockResolvedValueOnce([
      { id: 'l1', risk_id: 'r1', target_type: 'mor_case', target_id: 'm1', relation: 'raised_by' },
      { id: 'l2', risk_id: 'r1', target_type: 'component_inspection', target_id: 'i1', relation: 'evidenced_by' },
    ]);
    // resolveAlerts batches one getAllIn per present target type (here: mor + inspection)
    api.getAllIn
      .mockResolvedValueOnce([{ id: 'm1', status: 'in_triage' }])       // mor_cases
      .mockResolvedValueOnce([{ id: 'i1', inspection_result: 'failed' }]); // inspections
    await gtRiskStore.load();
    const s = get(gtRiskStore);
    expect(s.alertsByRisk.r1.openMor).toBe(true);
    expect(s.alertsByRisk.r1.failedInspection).toBe(true);
    expect(s.alertsByRisk.r1.overdueMaintenance).toBe(false);
  });

  it('still loads risks if alert resolution throws', async () => {
    pub.listRisks.mockResolvedValueOnce([{ id: 'r1', reference: 'RISK-0001', status: 'monitored' }]);
    pub.listAllRiskLinks.mockResolvedValueOnce([{ id: 'l1', risk_id: 'r1', target_type: 'mor_case', target_id: 'm1', relation: 'raised_by' }]);
    api.getAllIn.mockRejectedValue(new Error('boom'));   // safe() swallows per-source; alertsFor still runs
    await gtRiskStore.load();
    expect(get(gtRiskStore).risks).toHaveLength(1);
  });
});

describe('gtRiskStore.createRisk', () => {
  it('creates via public.createRisk, audits, and reloads', async () => {
    pub.createRisk.mockResolvedValueOnce({ id: 'r9', reference: 'RISK-0009' });
    pub.listRisks.mockResolvedValueOnce([{ id: 'r9', reference: 'RISK-0009', status: 'identified' }]);
    pub.listAllRiskLinks.mockResolvedValueOnce([]);
    const res = await gtRiskStore.createRisk({ title: 'Cladding', domain: 'fire', likelihood: 4, impact: 5 });
    expect(res.success).toBe(true);
    expect(pub.createRisk).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cladding' }), 'user-1');
    expect(logAudit).toHaveBeenCalledWith('create', 'gt_risk', 'r9', 'RISK-0009', expect.any(Object));
  });
});

describe('gtRiskStore.transitionRisk', () => {
  it('rejects an invalid transition without writing', async () => {
    const res = await gtRiskStore.transitionRisk({ id: 'r1', status: 'identified', reference: 'RISK-0001' }, 'monitored');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid risk status transition/);
    expect(pub.updateRisk).not.toHaveBeenCalled();
  });

  it('applies a valid transition', async () => {
    pub.updateRisk.mockResolvedValueOnce({ id: 'r1', reference: 'RISK-0001', status: 'assessed' });
    pub.listRisks.mockResolvedValueOnce([]);
    pub.listAllRiskLinks.mockResolvedValueOnce([]);
    const res = await gtRiskStore.transitionRisk({ id: 'r1', status: 'identified', reference: 'RISK-0001' }, 'assessed');
    expect(res.success).toBe(true);
    expect(pub.updateRisk).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'assessed' }), 'user-1');
  });
});
