// src/lib/apps/mor/stores/morStore.test.js
//
// CHARACTERIZATION tests for morStore — the statutory MOR workflow. These pin
// the contract that matters for compliance: a new case is stamped + referenced
// correctly and anonymised when asked; and since migration 263 a case MOVES only
// through its workflow — never by writing its status — with a triage and the
// BSR report recorded and moved together by the database (mor_triage,
// mor_record_bsr_report). The rules themselves (the machine, proposer ≠
// approver) are the database's and are tested there (workflowDb.test.js).
//
// Seams mocked: supabaseClient (auth + the refreshCase/fetchCases query chains),
// api, the workflow API, auditLogger, logger, and the verification-code generator.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  let single = { data: { id: 'c1', reference: 'MOR-2026-001', status: 'submitted' }, error: null };
  let list   = { data: [], error: null };

  // Chainable builder: .single() resolves `single`; awaiting the builder (the
  // .order() terminal in refreshCase/fetchCases) resolves `list`.
  const makeBuilder = () => {
    const b = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'in', 'order', 'range', 'insert', 'update', 'delete']) b[m] = vi.fn(chain);
    b.single = vi.fn(() => Promise.resolve(single));
    b.then = (res, rej) => Promise.resolve(list).then(res, rej);
    return b;
  };

  const supabase = {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'u@x' } } } })) },
    from: vi.fn(() => makeBuilder()),
  };

  let caseRow = { status: 'submitted' };           // what getById('mor_cases', …) returns
  const api = {
    // profiles lookup returns a profile; mor_cases lookup returns the staged row.
    getById: vi.fn((table) => Promise.resolve(table === 'profiles' ? { id: 'u1', full_name: 'Alice' } : caseRow)),
    create:  vi.fn((t, d) => Promise.resolve({ id: 'c1', reference: d.reference ?? 'MOR-2026-001', ...d })),
    update:  vi.fn(() => Promise.resolve({})),
    delete:  vi.fn(() => Promise.resolve()),
    rpc:     vi.fn(() => Promise.resolve({})),
  };

  // The case's workflow item, where the store looks it up.
  let items = [{ id: 'i1', subject_id: 'c1', step_key: 'submitted' }];
  const wfApi = {
    loadWorkflow: vi.fn(() => Promise.resolve({ workflow: { id: 'w1', key: 'mor_case' }, steps: [], moves: [], fields: [] })),
    listItems:    vi.fn(() => Promise.resolve(items)),
    itemHistory:  vi.fn(() => Promise.resolve([])),
    moveItem:     vi.fn(() => Promise.resolve({})),
    saveWorkflow: vi.fn(() => Promise.resolve('w1')),
    assignItem:   vi.fn(() => Promise.resolve({ changed: true })),
    listAssignees: vi.fn(() => Promise.resolve([])),
  };

  return {
    supabase, api, wfApi, logAudit: vi.fn(),
    setItems:   (r) => { items = r; },
    setSingle:  (r) => { single = r; },
    setList:    (r) => { list = r; },
    setCaseRow: (r) => { caseRow = r; },
  };
});

vi.mock('#lib/supabaseClient.js',            () => ({ supabase: h.supabase }));
vi.mock('#lib/utils/api.js',                 () => ({ api: h.api }));
vi.mock('#lib/utils/auditLogger.js',         () => ({ logAudit: h.logAudit }));
vi.mock('#lib/utils/logger.js',              () => ({ getLogger: () => () => {} }));
vi.mock('#lib/utils/caseVerificationCode.js', () => ({ generateVerificationCode: () => 'R7PQK2' }));
vi.mock('#lib/workflow/workflowApi.js',      () => h.wfApi);

const { morStore } = await import('./morStore.js');

// Pull the most recent api.update payload for a given table.
const lastUpdate = (table) => {
  const calls = h.api.update.mock.calls.filter(c => c[0] === table);
  return calls.length ? calls[calls.length - 1][2] : null;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.setSingle({ data: { id: 'c1', reference: 'MOR-2026-001', status: 'submitted' }, error: null });
  h.setList({ data: [], error: null });
  h.setCaseRow({ status: 'submitted' });
  h.setItems([{ id: 'i1', subject_id: 'c1', step_key: 'submitted' }]);
});

/** Load once so the store knows the case's workflow item. */
const withItem = async (step) => {
  h.setItems([{ id: 'i1', subject_id: 'c1', step_key: step }]);
  h.setList({ data: [{ id: 'c1', reference: 'MOR-2026-001' }], error: null });
  await morStore.fetchCases();
  h.setList({ data: [], error: null });
};

describe('fetchCases', () => {
  it('loads the case list newest-first and clears loading', async () => {
    h.setList({ data: [{ id: 'c1' }, { id: 'c2' }], error: null });
    await morStore.fetchCases();
    const s = get(morStore);
    expect(s.cases.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(s.loading).toBe(false);
    expect(h.supabase.from).toHaveBeenCalledWith('mor_cases');
  });

  it('records the error and clears loading on failure', async () => {
    h.setList({ data: null, error: new Error('rls denied') });
    await morStore.fetchCases();
    const s = get(morStore);
    expect(s.error).toBe('rls denied');
    expect(s.loading).toBe(false);
  });
});

describe('fetchCase', () => {
  it('selects the case it opens (the screen shows "No case selected" otherwise)', async () => {
    morStore.clearSelected();
    await morStore.fetchCase('c1');
    expect(get(morStore).selectedCase?.id).toBe('c1');
    morStore.clearSelected();
  });
});

describe('createCase', () => {
  it('stamps a verification code + status, omits reference (DB DEFAULT stamps it — mig 150), and writes the opening timeline entry', async () => {
    const r = await morStore.createCase({ description: 'Cracked beam in the car park ceiling.' });
    expect(r.success).toBe(true);

    const arg = h.api.create.mock.calls.find(c => c[0] === 'mor_cases')[1];
    expect(arg).toMatchObject({
      verification_code: 'R7PQK2',
      status: 'submitted',
      created_by: 'u1',
    });
    // reference is DB-stamped by the column default — the client must NOT send one
    expect(arg.reference).toBeUndefined();
    // opening timeline entry: status_change null → submitted
    const tl = h.api.create.mock.calls.find(c => c[0] === 'mor_timeline_entries')[1];
    expect(tl).toMatchObject({ entry_type: 'status_change', from_status: null, to_status: 'submitted' });
    expect(h.logAudit).toHaveBeenCalledWith('create', 'mor_case', 'c1', 'MOR-2026-001', expect.any(Object));
  });

  it('reads the new case\'s workflow item at once (the screen says "not in its workflow" otherwise)', async () => {
    h.wfApi.listItems.mockClear();
    h.setItems([{ id: 'i9', subject_id: 'c1', step_key: 'submitted' }]);
    await morStore.createCase({ description: 'A new case whose item the database creates.' });
    expect(h.wfApi.listItems).toHaveBeenCalled();
    expect(get(morStore).items.some(i => i.subject_id === 'c1')).toBe(true);
  });

  it('nulls reporter identity when the report is anonymous', async () => {
    await morStore.createCase({
      description: 'Anonymous tip about a fire door wedged open.',
      is_anonymous: true, reporter_name: 'Jo Bloggs', reporter_contact: 'jo@x.com',
    });
    const arg = h.api.create.mock.calls.find(c => c[0] === 'mor_cases')[1];
    expect(arg.is_anonymous).toBe(true);
    expect(arg.reporter_name).toBeNull();
    expect(arg.reporter_contact).toBeNull();
  });

  it('keeps trimmed reporter identity when not anonymous', async () => {
    await morStore.createCase({
      description: 'Named report of a structural issue on level 3.',
      is_anonymous: false, reporter_name: '  Jo  ', reporter_contact: '  jo@x.com  ',
    });
    const arg = h.api.create.mock.calls.find(c => c[0] === 'mor_cases')[1];
    expect(arg.reporter_name).toBe('Jo');
    expect(arg.reporter_contact).toBe('jo@x.com');
  });
});

// ⛔ Since migration 263 the store never writes a case's status: every move is
// the workflow's, and the database sets the status, dates and timeline.
const statusWritten = () => h.api.update.mock.calls.some(c => c[0] === 'mor_cases' && 'status' in (c[2] ?? {}));

describe('moveCase — through the workflow, never by writing the status', () => {
  it('moves the case\u2019s item and writes no status itself', async () => {
    await withItem('submitted');
    const r = await morStore.moveCase('c1', 'acknowledged');
    expect(r.success).toBe(true);
    expect(h.wfApi.moveItem).toHaveBeenCalledWith('i1', 'acknowledged', '');
    expect(statusWritten()).toBe(false);
    expect(h.logAudit).toHaveBeenCalledWith('update', 'mor_case', 'c1', 'MOR-2026-001',
      expect.objectContaining({ afterData: { from: 'submitted', to: 'acknowledged' } }));
  });

  it('shows the database\u2019s refusal and changes nothing', async () => {
    await withItem('decision_pending');
    h.wfApi.moveItem.mockRejectedValueOnce(new Error('The decision must be approved by a different person from the one who proposed it.'));
    const r = await morStore.moveCase('c1', 'bsr_notice');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/different person/);
    expect(get(morStore).error).toMatch(/different person/);
  });

  it('refuses a case not in its workflow yet, without writing', async () => {
    await withItem('submitted');
    h.setItems([]);
    await morStore.reloadItems();
    const r = await morStore.moveCase('c1', 'acknowledged');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not in its workflow/);
    expect(h.wfApi.moveItem).not.toHaveBeenCalled();
  });
});

describe('triage, assessment, BSR report, close — recorded with their move', () => {
  it('a triage goes through mor_triage, which records it and moves', async () => {
    await withItem('in_triage');
    const r = await morStore.submitTriage('c1', { outcome: 'clearly_reportable', rationale: 'obvious' });
    expect(r.success).toBe(true);
    expect(h.api.rpc).toHaveBeenCalledWith('mor_triage', { p_case: 'c1', p_outcome: 'clearly_reportable', p_rationale: 'obvious' });
    expect(h.wfApi.moveItem).not.toHaveBeenCalled();
    expect(statusWritten()).toBe(false);
  });

  it('the assessment is the move to a decision, carrying its summary', async () => {
    await withItem('in_assessment');
    await morStore.recordAssessment('c1', { advisorName: 'Dr Eng', summary: 'Beam overstressed.' });
    expect(h.wfApi.moveItem).toHaveBeenCalledWith('i1', 'decision_pending', 'Technical assessment from Dr Eng: Beam overstressed.');
  });

  it('the BSR report goes through mor_record_bsr_report with its reference', async () => {
    await withItem('bsr_notice');
    const r = await morStore.recordBsrReport('c1', { reportRef: 'BSR-1', submittedAt: '', notes: '' });
    expect(r.success).toBe(true);
    expect(h.api.rpc).toHaveBeenCalledWith('mor_record_bsr_report',
      { p_case: 'c1', p_ref: 'BSR-1', p_submitted_at: null, p_notes: null });
  });

  it('closing records the lessons learned, then moves to Closed', async () => {
    await withItem('remediated');
    await morStore.closeCase('c1', { lessonsLearned: ' Check props weekly. ' });
    expect(h.api.update).toHaveBeenCalledWith('mor_cases', 'c1', expect.objectContaining({ lessons_learned: 'Check props weekly.' }));
    expect(h.wfApi.moveItem).toHaveBeenCalledWith('i1', 'closed', 'Case closed. Lessons learned: Check props weekly.');
    expect(statusWritten()).toBe(false);
  });
});

describe('setUpWorkflow', () => {
  it('saves the shipped MOR workflow, marked for review, and attaches older cases', async () => {
    await morStore.setUpWorkflow();
    const def = h.wfApi.saveWorkflow.mock.calls[0][0];
    expect(def).toMatchObject({ key: 'mor_case', appId: 'mor', reviewRequired: true });
    expect(h.api.rpc).toHaveBeenCalledWith('mor_attach_to_workflow', {});
  });
});

describe('proposeDecision', () => {
  it('only proposes from decision_pending, clearing any prior approval', async () => {
    h.setCaseRow({ status: 'decision_pending' });
    const r = await morStore.proposeDecision('c1', { outcome: 'bsr', rationale: 'meets s.87' });
    expect(r.success).toBe(true);
    expect(lastUpdate('mor_cases')).toMatchObject({ decision_outcome: 'bsr', decision_approved_by: null });
  });

  it('refuses to propose when the case is not in decision_pending', async () => {
    h.setCaseRow({ status: 'in_triage' });
    const r = await morStore.proposeDecision('c1', { outcome: 'bsr', rationale: 'x' });
    expect(r.success).toBe(false);
    expect(h.api.update).not.toHaveBeenCalledWith('mor_cases', expect.anything(), expect.objectContaining({ decision_outcome: 'bsr' }));
  });
});

describe('addNote', () => {
  it('rejects an empty note without writing', async () => {
    const r = await morStore.addNote('c1', '   ');
    expect(r.success).toBe(false);
    expect(h.api.create).not.toHaveBeenCalled();
  });

  it('writes a note timeline entry and touches the case row', async () => {
    const r = await morStore.addNote('c1', 'Spoke to the contractor.');
    expect(r.success).toBe(true);
    const tl = h.api.create.mock.calls.find(c => c[0] === 'mor_timeline_entries')[1];
    expect(tl).toMatchObject({ entry_type: 'note', content: 'Spoke to the contractor.' });
    expect(h.api.update).toHaveBeenCalledWith('mor_cases', 'c1', expect.objectContaining({ updated_by: 'u1' }));
  });
});

// ⛔ An unread contact history used to leave the nudges treating every case as
// never contacted. The store now says it could not read it (§6ccc item 2).
describe('loadReporterContactsForCases', () => {
  it('flags an unread contact history, and clears it once a read succeeds', async () => {
    h.setList({ data: null, error: { message: 'timeout' } });
    await morStore.loadReporterContactsForCases(['c1']);
    expect(get(morStore).reporterContactsUnavailable).toBe(true);

    h.setList({ data: [{ id: 't1', case_id: 'c1', entry_type: 'reporter_contact' }], error: null });
    await morStore.loadReporterContactsForCases(['c1']);
    expect(get(morStore).reporterContactsUnavailable).toBe(false);
    expect(get(morStore).reporterContactsByCase.c1).toHaveLength(1);
    h.setList({ data: [], error: null });
  });
});
