// Complaints on the workflow manager (migration 252): a complaint moves only
// through its workflow item, the store says no first for what s.93's machine
// refuses, and who it is with is the workflow's assignee. The first time an
// administrator opens Complaints, the shipped workflow is saved and anything
// logged before it is attached.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { DEFAULT_COMPLAINT_WORKFLOW as W } from '../utils/complaintWorkflow.js';

const h = vi.hoisted(() => ({
  api: { get: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getAll: vi.fn(), rpc: vi.fn() },
  wf: { loadWorkflow: vi.fn(), listItems: vi.fn(), itemHistory: vi.fn(), moveItem: vi.fn(), saveWorkflow: vi.fn(),
        assignItem: vi.fn(), listAssignees: vi.fn() },
}));
vi.mock('#lib/utils/api.js', () => ({ api: h.api }));
vi.mock('#lib/workflow/workflowApi.js', () => h.wf);
vi.mock('#lib/workflow/nonWorkingDays.js', () => ({ ensureNonWorkingDays: vi.fn(async () => 0) }));
vi.mock('#lib/supabaseClient.js', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'u@x' } } } }) } },
}));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { complaintsStore } = await import('./complaintsStore.js');

const CASE = { id: 'c1', reference: 'CMP-2026-000001', status: 'investigating', response_text: '' };
const WORKFLOW = { workflow: { id: 'w1', key: 'complaint' }, steps: W.steps, moves: W.moves };

beforeEach(async () => {
  vi.clearAllMocks();
  h.api.getAll.mockResolvedValue([CASE]);
  h.api.get.mockResolvedValue([]);
  h.api.getById.mockImplementation(async (table) => (table === 'complaint_cases' ? CASE : { id: 'u1', full_name: 'Sam' }));
  h.wf.loadWorkflow.mockResolvedValue(WORKFLOW);
  h.wf.listItems.mockResolvedValue([{ id: 'i1', subject_id: 'c1', step_key: 'investigating', assigned_to: null }]);
  h.wf.moveItem.mockResolvedValue({ step: 'withdrawn', action: null });
  h.wf.assignItem.mockResolvedValue({ assigned_to: 'u2', changed: true });
  complaintsStore.clearError();
  await complaintsStore.load();
});

describe('a complaint moves through its workflow', () => {
  it('loads the workflow and its items with the cases', () => {
    const s = get(complaintsStore);
    expect(s.workflow?.id).toBe('w1');
    expect(s.items).toHaveLength(1);
  });

  it('a move goes to the workflow item — never a direct status update', async () => {
    await complaintsStore.transition('c1', 'withdrawn', 'They withdrew');
    expect(h.wf.moveItem).toHaveBeenCalledWith('i1', 'withdrawn', 'They withdrew');
    expect(h.api.update).not.toHaveBeenCalled();
  });

  it('what s.93 refuses is refused first, and said: responding with no response written', async () => {
    await expect(complaintsStore.transition('c1', 'responded')).rejects.toThrow(/Write the response first/);
    expect(h.wf.moveItem).not.toHaveBeenCalled();
    expect(get(complaintsStore).error).toMatch(/Write the response first/);
  });

  it('a complaint not yet in its workflow cannot be moved, and says why', async () => {
    h.wf.listItems.mockResolvedValue([]);
    await complaintsStore.load();
    await expect(complaintsStore.transition('c1', 'withdrawn', 'x')).rejects.toThrow(/not in its workflow yet/);
  });

  it('who it is with is the workflow’s assignee, noted on the case’s timeline', async () => {
    await complaintsStore.assign('c1', 'u2', 'Robert');
    expect(h.wf.assignItem).toHaveBeenCalledWith('i1', 'u2');
    expect(h.api.create).toHaveBeenCalledWith('complaint_timeline_entries', expect.objectContaining({ entry_type: 'assignment', content: 'Given to Robert.' }), true);
    expect(h.api.update).not.toHaveBeenCalled();                 // the old assigned_to column is not written
  });

  it('setting up saves the shipped workflow, marked for review, then attaches what was logged before', async () => {
    await complaintsStore.setUpWorkflow();
    expect(h.wf.saveWorkflow).toHaveBeenCalledWith(expect.objectContaining({ key: 'complaint', reviewRequired: true }));
    expect(h.api.rpc).toHaveBeenCalledWith('complaint_attach_to_workflow', {});
  });
});
