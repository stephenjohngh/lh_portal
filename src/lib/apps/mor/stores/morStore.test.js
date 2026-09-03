// src/lib/apps/mor/stores/morStore.test.js
//
// CHARACTERIZATION tests for morStore — the statutory MOR workflow. These pin
// the contract that matters for compliance: a new case is stamped + referenced
// correctly and anonymised when asked; the state machine rejects illegal
// transitions BEFORE writing; triage outcomes map to the right next status; and
// the two-step decision enforces proposer ≠ approver.
//
// Seams mocked: supabaseClient (auth + the refreshCase/fetchCases query chains),
// api, auditLogger, logger, and the reference/verification-code generators.
// isValidTransition is left REAL — it is the authentic state machine (and mirrors
// the migration-137 trigger), so the tests exercise the genuine transition rules.

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
    for (const m of ['select', 'eq', 'in', 'order', 'insert', 'update', 'delete']) b[m] = vi.fn(chain);
    b.single = vi.fn(() => Promise.resolve(single));
    b.then = (res, rej) => Promise.resolve(list).then(res, rej);
    return b;
  };

  const supabase = {
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1', email: 'u@x' } } })) },
    from: vi.fn(() => makeBuilder()),
  };

  let caseRow = { status: 'submitted' };           // what getById('mor_cases', …) returns
  const api = {
    // profiles lookup returns a profile; mor_cases lookup returns the staged row.
    getById: vi.fn((table) => Promise.resolve(table === 'profiles' ? { id: 'u1', full_name: 'Alice' } : caseRow)),
    create:  vi.fn((t, d) => Promise.resolve({ id: 'c1', reference: d.reference ?? 'MOR-2026-001', ...d })),
    update:  vi.fn(() => Promise.resolve({})),
    delete:  vi.fn(() => Promise.resolve()),
  };

  return {
    supabase, api, logAudit: vi.fn(),
    setSingle:  (r) => { single = r; },
    setList:    (r) => { list = r; },
    setCaseRow: (r) => { caseRow = r; },
  };
});

vi.mock('$lib/supabaseClient',            () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/api',                 () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger',         () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',              () => ({ getLogger: () => () => {} }));
vi.mock('$lib/utils/caseVerificationCode', () => ({ generateVerificationCode: () => 'R7PQK2' }));

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
});

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

describe('transitionStatus (via acknowledge)', () => {
  it('allows a legal transition and stamps the milestone timestamp', async () => {
    h.setCaseRow({ status: 'submitted' });               // submitted → acknowledged is legal
    const r = await morStore.acknowledge('c1');
    expect(r.success).toBe(true);
    const patch = lastUpdate('mor_cases');
    expect(patch.status).toBe('acknowledged');
    expect(patch.acknowledged_at).toBeTruthy();
  });

  it('REJECTS an illegal transition without writing', async () => {
    h.setCaseRow({ status: 'closed' });                  // closed → acknowledged is NOT legal
    const r = await morStore.acknowledge('c1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/invalid transition/i);
    expect(h.api.update).not.toHaveBeenCalledWith('mor_cases', expect.anything(), expect.objectContaining({ status: 'acknowledged' }));
  });
});

describe('submitTriage — outcome → next status mapping', () => {
  beforeEach(() => h.setCaseRow({ status: 'in_triage' }));

  it('clearly_reportable → decision_pending', async () => {
    const r = await morStore.submitTriage('c1', { outcome: 'clearly_reportable', rationale: 'obvious' });
    expect(r.success).toBe(true);
    expect(lastUpdate('mor_cases')).toMatchObject({ status: 'decision_pending', triage_outcome: 'clearly_reportable' });
  });

  it('possibly_reportable → in_assessment', async () => {
    const r = await morStore.submitTriage('c1', { outcome: 'possibly_reportable', rationale: 'need advice' });
    expect(r.success).toBe(true);
    expect(lastUpdate('mor_cases').status).toBe('in_assessment');
  });

  it('not_reportable → reclassified', async () => {
    const r = await morStore.submitTriage('c1', { outcome: 'not_reportable', rationale: 'below threshold' });
    expect(r.success).toBe(true);
    expect(lastUpdate('mor_cases').status).toBe('reclassified');
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

describe('approveDecision — two-step separation of duties', () => {
  it('REJECTS approval by the same user who proposed the decision', async () => {
    // current user is u1 (the auth mock); proposer is also u1.
    h.setCaseRow({ status: 'decision_pending', decision_outcome: 'bsr', decision_proposed_by: 'u1' });
    const r = await morStore.approveDecision('c1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/different user/i);
    expect(h.api.update).not.toHaveBeenCalled();
  });

  it('approves a bsr decision proposed by someone else → bsr_notice', async () => {
    h.setCaseRow({ status: 'decision_pending', decision_outcome: 'bsr', decision_proposed_by: 'other' });
    const r = await morStore.approveDecision('c1');
    expect(r.success).toBe(true);
    expect(lastUpdate('mor_cases')).toMatchObject({ status: 'bsr_notice', decision_approved_by: 'u1' });
  });

  it('approves an internal decision → in_remediation', async () => {
    h.setCaseRow({ status: 'decision_pending', decision_outcome: 'internal', decision_proposed_by: 'other' });
    const r = await morStore.approveDecision('c1');
    expect(r.success).toBe(true);
    expect(lastUpdate('mor_cases').status).toBe('in_remediation');
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
