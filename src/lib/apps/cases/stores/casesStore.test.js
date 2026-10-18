// The Cases store (migration 253): a case moves only through its workflow
// item, the audit log names it by reference only, and deleting one deletes its
// documents FIRST — keeping the case if they cannot go.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({
  api: { get: vi.fn(), getAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), rpc: vi.fn() },
  wf: { loadWorkflow: vi.fn(), listItems: vi.fn(), itemHistory: vi.fn(), moveItem: vi.fn(), assignItem: vi.fn(), listAssignees: vi.fn() },
  logAudit: vi.fn(),
  deleteDocumentsFor: vi.fn(),
}));
vi.mock('#lib/utils/api.js', () => ({ api: h.api }));
vi.mock('#lib/workflow/workflowApi.js', () => h.wf);
vi.mock('#lib/utils/documentApi.js', () => ({ deleteDocumentsFor: h.deleteDocumentsFor }));
vi.mock('#lib/utils/currentUser.js', () => ({ requireUserId: async () => 'u1' }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: h.logAudit }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { casesStore } = await import('./casesStore.js');

const PROCESSES = [{ id: 'w1', key: 'case_change', name: 'Change control', app_id: 'cases' },
                   { id: 'w2', key: 'case_triage', name: 'Concern triage', app_id: 'cases' }];
const CASE = { id: 'c1', reference: 'CAS-2026-000001', title: 'Flat 12 boiler swap' };

beforeEach(async () => {
  vi.clearAllMocks();
  h.api.getAll.mockImplementation(async (/** @type {string} */ table) => (table === 'workflows' ? PROCESSES : [CASE]));
  h.wf.loadWorkflow.mockImplementation(async (/** @type {string} */ key) => ({
    workflow: PROCESSES.find((p) => p.key === key),
    steps: [{ key: 'open', name: 'Open', kind: 'start' }, { key: 'done', name: 'Done', kind: 'done' }],
    moves: [{ from_key: 'open', to_key: 'done', label: 'Finish' }], fields: [],
  }));
  h.wf.listItems.mockResolvedValue([{ id: 'i1', subject_id: 'c1', step_key: 'open' }]);
  h.wf.moveItem.mockResolvedValue({ step: 'done' });
  h.api.rpc.mockResolvedValue({ id: 'c2', reference: 'CAS-2026-000002' });
  h.deleteDocumentsFor.mockResolvedValue(undefined);
  await casesStore.load();
});

describe('cases', () => {
  it('reads only the Cases processes, and the first by default', () => {
    expect(h.api.getAll).toHaveBeenCalledWith('workflows', expect.objectContaining({ filters: { app_id: 'cases' } }));
    const s = get(casesStore);
    expect(s.chosen).toBe('case_change');
    expect(s.cases).toHaveLength(1);
  });

  it('another process can be chosen; an unknown one falls back to the first', async () => {
    await casesStore.load('case_triage');
    expect(get(casesStore).chosen).toBe('case_triage');
    await casesStore.load('nope');
    expect(get(casesStore).chosen).toBe('case_change');
  });

  it('a case is opened through case_open() in the chosen process, and the audit names its reference only', async () => {
    await casesStore.create({ title: ' Boiler ', description: '', fields: { contractor: 'ACME' } });
    expect(h.api.rpc).toHaveBeenCalledWith('case_open', { p_workflow: 'w1', p_title: 'Boiler', p_description: null, p_fields: { contractor: 'ACME' } });
    expect(h.api.create).not.toHaveBeenCalled();                   // never a direct insert: it would skip the field checks
    const [, , , name, opts] = h.logAudit.mock.calls[0];
    expect(name).toBe('CAS-2026-000002');
    expect(JSON.stringify(opts)).not.toMatch(/Boiler|ACME/);
  });

  it('an edit stamps who made it (the user id is awaited, never a promise)', async () => {
    await casesStore.save(/** @type {any} */ (CASE), { title: 'Boiler swap', description: '' });
    expect(h.api.update).toHaveBeenCalledWith('cases', 'c1', { title: 'Boiler swap', description: null, updated_by: 'u1' });
  });

  it('a move goes to the workflow item — the audit names reference and step, never the title', async () => {
    await casesStore.move(CASE, 'done', 'checked');
    expect(h.wf.moveItem).toHaveBeenCalledWith('i1', 'done', 'checked');
    expect(h.logAudit.mock.calls[0][3]).toBe('CAS-2026-000001 — Done');
    expect(JSON.stringify(h.logAudit.mock.calls)).not.toMatch(/boiler/i);
  });

  it('deleting deletes documents FIRST; if they cannot go, the case is kept', async () => {
    await casesStore.remove(CASE);
    expect(h.deleteDocumentsFor).toHaveBeenCalledWith('case', 'c1');
    expect(h.deleteDocumentsFor.mock.invocationCallOrder[0]).toBeLessThan(h.api.delete.mock.invocationCallOrder[0]);

    vi.clearAllMocks();
    h.deleteDocumentsFor.mockRejectedValue(new Error('Drive said no'));
    await expect(casesStore.remove(CASE)).rejects.toThrow(/Drive said no/);
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it('with no Cases process, nothing is chosen and nothing read', async () => {
    h.api.getAll.mockImplementation(async () => []);
    await casesStore.load();
    expect(get(casesStore)).toMatchObject({ processes: [], chosen: '', workflow: null, cases: [] });
  });
});
