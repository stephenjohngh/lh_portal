// src/lib/apps/golden_thread/stores/gtRiskStore.test.js
// Store-contract tests: mock the I/O seams (public.js risk accessors, api,
// supabase auth, auditLogger). The scoring/lifecycle pure logic is pinned by
// gtRiskScoring.test.js / gtRiskLifecycle.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const { api, getSession, logAudit, pub } = vi.hoisted(() => ({
  api: { getAllIn: vi.fn(async () => []) },
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })),
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

vi.mock('#lib/utils/api.js', () => ({ api }));
vi.mock('#lib/supabaseClient.js', () => ({ supabase: { auth: { getSession } } }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('#lib/apps/golden_thread/public.js', () => pub);
const wfApi = vi.hoisted(() => ({
  loadWorkflow: vi.fn(async () => null),
  listItems: vi.fn(async () => []),
  saveWorkflow: vi.fn(),
  itemHistory: vi.fn(async () => []),
  moveItem: vi.fn(async () => ({ step: 'x' })),
  assignItem: vi.fn(),
  listAssignees: vi.fn(async () => []),
}));
vi.mock('#lib/workflow/workflowApi.js', () => wfApi);

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
    api.getAllIn.mockRejectedValueOnce(new Error('boom'));   // safe() reads it as empty; alertsFor still runs
    await gtRiskStore.load();
    expect(get(gtRiskStore).risks).toHaveLength(1);
    // ⛔ …and SAYS so: an unread source is not "no escalation".
    expect(get(gtRiskStore).alertsUnavailable).toBe(true);
  });

  it('clears the flag once every source reads', async () => {
    pub.listRisks.mockResolvedValueOnce([{ id: 'r1', reference: 'RISK-0001', status: 'monitored' }]);
    pub.listAllRiskLinks.mockResolvedValueOnce([{ id: 'l1', risk_id: 'r1', target_type: 'mor_case', target_id: 'm1', relation: 'raised_by' }]);
    api.getAllIn.mockResolvedValueOnce([{ id: 'm1', status: 'closed' }]);
    await gtRiskStore.load();
    expect(get(gtRiskStore).alertsUnavailable).toBe(false);
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

// Migration 264: a risk moves through the shared workflow manager; the store
// never writes gt_risks.status itself (the database's one UPDATE is chained).
describe('gtRiskStore.moveRisk — through the workflow', () => {
  it('moves the item with its note and never writes the status', async () => {
    wfApi.loadWorkflow.mockResolvedValueOnce({ workflow: { id: 'wf' }, steps: [], moves: [], fields: [] });
    wfApi.listItems.mockResolvedValueOnce([{ id: 'item-r', subject_id: 'r1', step_key: 'monitored' }]);
    pub.listRisks.mockResolvedValueOnce([{ id: 'r1', reference: 'RISK-0001', status: 'monitored' }]);
    await gtRiskStore.load();
    pub.getRisk.mockResolvedValueOnce({ id: 'r1', reference: 'RISK-0001', status: 'closed' });
    const res = await gtRiskStore.moveRisk({ id: 'r1', reference: 'RISK-0001', status: 'monitored' }, 'closed', 'eliminated');
    expect(res.success).toBe(true);
    expect(wfApi.moveItem).toHaveBeenCalledWith('item-r', 'closed', 'eliminated');
    expect(pub.updateRisk).not.toHaveBeenCalled();
  });

  it('refuses, writing nothing, while the risk is not in its workflow', async () => {
    pub.listRisks.mockResolvedValueOnce([{ id: 'r2', status: 'identified' }]);
    await gtRiskStore.load();
    const res = await gtRiskStore.moveRisk({ id: 'r2', status: 'identified' }, 'assessed');
    expect(res.success).toBe(false);
    expect(wfApi.moveItem).not.toHaveBeenCalled();
    expect(pub.updateRisk).not.toHaveBeenCalled();
  });
});
