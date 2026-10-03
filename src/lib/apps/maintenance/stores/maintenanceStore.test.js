// src/lib/apps/maintenance/stores/maintenanceStore.test.js
//
// CHARACTERIZATION tests for maintenanceStore. Pins the contract: load enriches
// jobs with a RAG status + detects contractor identity; job CRUD writes the
// right status transitions and audits; completeJob spawns the next recurrence
// from the OBLIGATION frequency and links it back; saveJobComponents is a
// delete-then-insert of non-empty results; generateJobs walks the date range
// and skips dates that already have a job.
//
// Seams mocked: supabaseClient (auth), api, auditLogger, logger, mediaUpload,
// driveUtils, and inspection/public.js — obligations live in another app's
// library now (migration 204) and are read through its public interface. The pure date/RAG helpers (maintenanceHelpers) are left REAL so
// the recurrence-date arithmetic is exercised for real. The creator id comes from
// supabase.auth.getSession() (mocked below).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  let tables = {};
  let profile = { is_contractor: false };
  let updateExtra = {};   // extra fields merged into api.update return (e.g. obligation_id)
  let obligations = [];   // what inspection/public.js hands back

  const api = {
    get:        vi.fn((table) => Promise.resolve(tables[table] ?? [])),
    getById:    vi.fn(() => Promise.resolve(profile)),
    create:     vi.fn((table, data) => Promise.resolve({ id: `${table}-${Math.random().toString(36).slice(2, 7)}`, ...data })),
    update:     vi.fn((table, id, data) => Promise.resolve({ id, ...updateExtra, ...data })),
    delete:     vi.fn(() => Promise.resolve()),
    deleteMany: vi.fn(() => Promise.resolve()),
    createMany: vi.fn(() => Promise.resolve([])),
  };
  api.getAll = api.get;   // the real getAll pages; here it answers as get does
  api.getAllIn = vi.fn((table, col, ids) => Promise.resolve((tables[table] ?? []).filter((r) => ids.includes(r[col]))));
  const supabase = {
    auth: {
      getUser:    vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'tok', user: { id: 'u1' } } } })),
    },
  };
  return {
    api, supabase, logAudit: vi.fn(),
    uploadMedia: vi.fn(() => Promise.resolve({ url: 'https://store/doc.pdf' })),
    setTables:      (t) => { tables = t; },
    setProfile:     (p) => { profile = p; },
    setUpdateExtra: (e) => { updateExtra = e; },
    setObligations: (o) => { obligations = o; },
    listPlannedObligations: vi.fn(() => Promise.resolve(obligations)),
    deleteStorageObjects: vi.fn(() => Promise.resolve({ deleted: 1, failed: 0, results: [] })),
    deleteDocumentsFor:   vi.fn(() => Promise.resolve(0)),
  };
});

vi.mock('$lib/supabaseClient',      () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/api',           () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger',   () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',        () => ({ getLogger: () => () => {} }));
vi.mock('$lib/utils/mediaUpload.js',() => ({ uploadMedia: h.uploadMedia }));
vi.mock('$lib/utils/mediaAttachments.js', () => ({ deleteStorageObjects: h.deleteStorageObjects }));
vi.mock('$lib/utils/documentApi.js', () => ({
  uploadDocument: vi.fn(), deleteDocument: vi.fn(), deleteDocumentsFor: h.deleteDocumentsFor,
}));
vi.mock('$lib/apps/compliance/public.js', () => ({ listPlannedObligations: h.listPlannedObligations }));

const { maintenanceStore } = await import('./maintenanceStore.js');

const lastJobUpdate = () => {
  const calls = h.api.update.mock.calls.filter(c => c[0] === 'maintenance_jobs');
  return calls.length ? calls[calls.length - 1][2] : null;
};
const jobCreates = () => h.api.create.mock.calls.filter(c => c[0] === 'maintenance_jobs');

beforeEach(() => {
  vi.clearAllMocks();
  h.setTables({});
  h.setProfile({ is_contractor: false });
  h.setUpdateExtra({});
  h.setObligations([]);
});

describe('load', () => {
  it('enriches jobs with a RAG status and detects contractor identity', async () => {
    h.setProfile({ is_contractor: true });
    h.setTables({
      maintenance_jobs: [{ id: 'j1', title: 'Boiler', scheduled_date: '2026-01-01', status: 'scheduled' }],
    });
    await maintenanceStore.load();
    const s = get(maintenanceStore);
    expect(s.jobs[0]).toHaveProperty('rag');           // enrichJob added it
    expect(s.isContractor).toBe(true);
    expect(s.loading).toBe(false);
  });

  it('records the error and rethrows on failure', async () => {
    h.api.get.mockRejectedValueOnce(new Error('db down'));
    await expect(maintenanceStore.load()).rejects.toThrow('db down');
    expect(get(maintenanceStore).error).toBe('db down');
  });
});

describe('createJob', () => {
  it('creates a scheduled job, stamps the creator, audits, and inserts into the sorted list', async () => {
    h.setTables({ maintenance_jobs: [{ id: 'j0', title: 'Old', scheduled_date: '2026-06-01', status: 'scheduled' }] });
    await maintenanceStore.load();

    const job = await maintenanceStore.createJob({ title: 'New', scheduled_date: '2026-01-01' });
    const arg = jobCreates()[0][1];
    expect(arg).toMatchObject({ title: 'New', status: 'scheduled', created_by: 'u1' });
    expect(job).toHaveProperty('rag');
    // inserted ahead of j0 (sorted by scheduled_date asc)
    expect(get(maintenanceStore).jobs.map(j => j.scheduled_date)).toEqual(['2026-01-01', '2026-06-01']);
    expect(h.logAudit).toHaveBeenCalledWith('create', 'maintenance_job', job.id, 'New', expect.any(Object));
  });
});

describe('completeJob', () => {
  it('marks the job completed and spawns the next recurrence from the obligation frequency', async () => {
    h.setObligations([{ id: 'reg1', name: 'Service', frequency_days: 30, evidenced_by: 'maintenance_job' }]);
    await maintenanceStore.load();
    // the completed job carries a obligation_id so a recurrence is due
    h.setUpdateExtra({ obligation_id: 'reg1', scope_type: 'system', scope_id: 'sys1', scope_label: 'Fire', title: 'Service', description: 'd' });

    await maintenanceStore.completeJob('j1', { result: 'pass', completedDate: '2026-01-01', createNextJob: true });

    expect(lastJobUpdate()).toMatchObject({ next_job_id: expect.any(String) });
    const nextCreate = jobCreates()[0][1];
    expect(nextCreate).toMatchObject({ obligation_id: 'reg1', status: 'scheduled', scheduled_date: '2026-01-31' }); // +30 days
  });

  it('does NOT spawn a recurrence when the job has no obligation link', async () => {
    h.setUpdateExtra({});   // no obligation_id on the returned row
    await maintenanceStore.completeJob('j1', { result: 'pass', completedDate: '2026-01-01', createNextJob: true });
    expect(jobCreates()).toHaveLength(0);
    expect(h.api.update).toHaveBeenCalledWith('maintenance_jobs', 'j1', expect.objectContaining({ status: 'completed', result: 'pass' }), true);
  });
});

describe('cancel / reopen / delete', () => {
  it('cancelJob sets status cancelled', async () => {
    await maintenanceStore.cancelJob('j1');
    expect(lastJobUpdate().status).toBe('cancelled');
  });

  it('reopenJob resets to scheduled and clears the completion fields', async () => {
    await maintenanceStore.reopenJob('j1');
    expect(lastJobUpdate()).toMatchObject({ status: 'scheduled', completed_date: null, result: null });
  });

  it('deleteJob removes the job and its docs from state and audits', async () => {
    h.setTables({ maintenance_jobs: [{ id: 'j1', title: 'X', scheduled_date: '2026-01-01', status: 'scheduled' }] });
    await maintenanceStore.load();
    await maintenanceStore.deleteJob('j1');
    expect(h.api.delete).toHaveBeenCalledWith('maintenance_jobs', 'j1');
    expect(get(maintenanceStore).jobs).toHaveLength(0);
    expect(h.logAudit).toHaveBeenCalledWith('delete', 'maintenance_job', 'j1', 'j1', expect.any(Object));
  });

  // The cascade removed the document ROWS and left every certificate in Drive,
  // while the confirmation promised "and all its documents" (2026-09-27).
  it("deleteJob deletes the job's files first — library and older ones — then the job", async () => {
    h.setTables({
      maintenance_jobs: [{ id: 'j1', title: 'X', scheduled_date: '2026-01-01', status: 'scheduled' }],
      maintenance_documents: [
        { id: 'm1', storage_path: 'https://drive/new', library_doc_id: 'lib1' },
        { id: 'm2', storage_path: 'https://drive/old', library_doc_id: null },
      ],
    });
    await maintenanceStore.load();
    const order = [];
    h.deleteDocumentsFor.mockImplementationOnce((t, id) => { order.push(`library ${t}:${id}`); return Promise.resolve(1); });
    h.deleteStorageObjects.mockImplementationOnce((rows) => {
      order.push(`older ${rows.map(r => r.storage_url).join(',')}`);
      return Promise.resolve({ deleted: rows.length, failed: 0, results: [] });
    });
    h.api.delete.mockImplementationOnce((t, id) => { order.push(`row ${t}:${id}`); return Promise.resolve(); });

    await maintenanceStore.deleteJob('j1');
    expect(order).toEqual(['library maintenance_document:j1', 'older https://drive/old', 'row maintenance_jobs:j1']);
  });

  it('deleteJob KEEPS the job when one of its files cannot be deleted', async () => {
    h.setTables({
      maintenance_jobs: [{ id: 'j1', title: 'X', scheduled_date: '2026-01-01', status: 'scheduled' }],
      maintenance_documents: [{ id: 'm2', storage_path: 'https://drive/old', library_doc_id: null }],
    });
    await maintenanceStore.load();
    h.deleteDocumentsFor.mockRejectedValueOnce(new Error('1 of 1 attached document(s) could not be deleted'));
    await expect(maintenanceStore.deleteJob('j1')).rejects.toThrow(/could not be deleted/);
    h.deleteStorageObjects.mockResolvedValueOnce({ deleted: 0, failed: 1, results: [] });
    await expect(maintenanceStore.deleteJob('j1')).rejects.toThrow(/job was kept/);
    expect(h.api.delete).not.toHaveBeenCalledWith('maintenance_jobs', 'j1');
    expect(get(maintenanceStore).jobs).toHaveLength(1);
  });
});

describe('saveJobComponents', () => {
  it('deletes existing then inserts only the components that have a result', async () => {
    await maintenanceStore.saveJobComponents('j1', [
      { component_id: 'c1', result: 'pass', notes: ' ok ' },
      { component_id: 'c2', result: '' },                  // no result → dropped
      { component_id: 'c3', result: 'fail', notes: '' },
    ]);
    expect(h.api.deleteMany).toHaveBeenCalledWith('maintenance_job_components', { job_id: 'j1' });
    const rows = h.api.createMany.mock.calls[0][1];
    expect(rows.map(r => r.component_id)).toEqual(['c1', 'c3']);
    expect(rows[0].notes).toBe('ok');                      // trimmed
  });
});

describe('generateJobs', () => {
  const sel = [{ obligation_id: 'reg1', scope_type: 'system', scope_id: 'sys1', scope_label: 'Fire', title: 'Service' }];

  beforeEach(async () => {
    h.setObligations([{ id: 'reg1', name: 'Service', frequency_days: 30, evidenced_by: 'maintenance_job' }]);
    await maintenanceStore.load();
  });

  it('walks the date range at the obligation frequency', async () => {
    const created = await maintenanceStore.generateJobs(sel, '2026-01-01', '2026-02-15');
    // 2026-01-01, +30 = 2026-01-31, +30 = 2026-03-02 (> toDate, stop) → 2 jobs
    expect(created.map(j => j.scheduled_date)).toEqual(['2026-01-01', '2026-01-31']);
  });

  it('skips dates that already have a job (idempotent on a second run)', async () => {
    await maintenanceStore.generateJobs(sel, '2026-01-01', '2026-02-15');
    const second = await maintenanceStore.generateJobs(sel, '2026-01-01', '2026-02-15');
    expect(second).toHaveLength(0);
  });

  // An on-demand obligation has no cadence, so there is no series to lay out —
  // it is scheduled by hand, not generated.
  it('generates nothing for an obligation with no frequency', async () => {
    h.setObligations([{ id: 'reg1', name: 'Ad-hoc', frequency_days: null, evidenced_by: 'maintenance_job' }]);
    await maintenanceStore.load();
    expect(await maintenanceStore.generateJobs(sel, '2026-01-01', '2026-12-31')).toHaveLength(0);
  });
});

describe('load — obligations come from the shared library', () => {
  // The Maintenance app must never query the obligation table directly: it
  // belongs to Inspection and is read through its public.js.
  it('reads job-evidenced obligations only, and never queries the table itself', async () => {
    h.setObligations([
      { id: 'o1', name: 'Alarm service',  frequency_days: 180, evidenced_by: 'maintenance_job' },
      { id: 'o2', name: 'Either route',   frequency_days: 90,  evidenced_by: 'either' },
      { id: 'o3', name: 'Door walk',      frequency_days: 90,  evidenced_by: 'inspection' },
    ]);
    await maintenanceStore.load();

    expect(get(maintenanceStore).obligations.map(o => o.id)).toEqual(['o1', 'o2']);
    expect(h.listPlannedObligations).toHaveBeenCalledWith({ activeOnly: true });
    const queried = h.api.get.mock.calls.map(c => c[0]);
    expect(queried).not.toContain('statutory_obligations');
    expect(queried).not.toContain('maintenance_regime');
  });

  it('degrades to no obligations rather than failing the whole load', async () => {
    h.listPlannedObligations.mockRejectedValueOnce(new Error('RLS says no'));
    await maintenanceStore.load();
    expect(get(maintenanceStore).obligations).toEqual([]);
    expect(get(maintenanceStore).error).toBeNull();
  });

  // ⛔ …but it SAYS so. An empty scheduler reads as "nothing is due", which is
  // the one thing it must never say by accident (2026-10-03, §6ccc item 2).
  it('names what it could not read, and clears it once a load succeeds', async () => {
    h.listPlannedObligations.mockRejectedValueOnce(new Error('RLS says no'));
    await maintenanceStore.load();
    expect(get(maintenanceStore).unavailable).toEqual(['the planned obligations']);
    await maintenanceStore.load();
    expect(get(maintenanceStore).unavailable).toEqual([]);
  });
});

// ⛔ The file goes first, and a file that cannot go keeps its row. This caught
// the storage failure as "non-fatal" and deleted the row anyway, leaving the
// file in storage with nothing naming it (§6ccc item 2, 2026-10-03).
describe('deleteDocument', () => {
  it('keeps the row when a legacy file cannot be deleted', async () => {
    h.deleteStorageObjects.mockResolvedValueOnce({ deleted: 0, failed: 1, results: [] });
    await expect(maintenanceStore.deleteDocument('doc-1', 'https://drive.google.com/file/d/abc/view'))
      .rejects.toThrow(/document was kept/);
    expect(h.api.delete).not.toHaveBeenCalledWith('maintenance_documents', 'doc-1');
  });

  it('deletes the row once the file has gone', async () => {
    await maintenanceStore.deleteDocument('doc-2', 'https://drive.google.com/file/d/def/view');
    expect(h.deleteStorageObjects).toHaveBeenCalled();
    expect(h.api.delete).toHaveBeenCalledWith('maintenance_documents', 'doc-2');
  });
});

// ⛔ A component carries only its type CODE, and the system belongs to the
// type. The scope read filtered components on `system_id` / `type_id`, which
// do not exist, so every type- or system-scoped job failed to list its
// components (§6ccc item 3, 2026-10-03).
describe('loadScopeComponents', () => {
  const comps = [
    { id: 'c1', type_code: 'door' },
    { id: 'c2', type_code: 'door' },
    { id: 'c3', type_code: 'lamp' },
  ];

  it('a type-scoped job lists the components of that type, by code', async () => {
    h.setTables({ component_types: [{ code: 'door' }], components: comps });
    const out = await maintenanceStore.loadScopeComponents('type', 't-door');
    expect(h.api.get).toHaveBeenCalledWith('component_types', expect.objectContaining({ filters: { id: 't-door' } }));
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it("a system-scoped job lists the components of every type in the system", async () => {
    h.setTables({ component_types: [{ code: 'door' }, { code: 'lamp' }], components: comps });
    const out = await maintenanceStore.loadScopeComponents('system', 's-fire');
    expect(h.api.get).toHaveBeenCalledWith('component_types',
      expect.objectContaining({ filters: { building_system_id: 's-fire' } }));
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('never filters components on a column they do not have', async () => {
    h.setTables({ component_types: [{ code: 'door' }], components: comps });
    await maintenanceStore.loadScopeComponents('type', 't-door');
    const onComponents = [...h.api.get.mock.calls, ...h.api.getAllIn.mock.calls].filter((c) => c[0] === 'components');
    for (const call of onComponents) expect(JSON.stringify(call)).not.toMatch(/system_id|type_id|name/);
  });
});
