// src/lib/apps/maintenance/stores/maintenanceStore.test.js
//
// CHARACTERIZATION tests for maintenanceStore. Pins the contract: load enriches
// jobs with a RAG status + detects contractor identity; job CRUD writes the
// right status transitions and audits; completeJob spawns the next recurrence
// from the regime frequency and links it back; saveJobComponents is a
// delete-then-insert of non-empty results; generateJobs walks the date range
// and skips dates that already have a job.
//
// Seams mocked: supabaseClient (auth), api, auditLogger, logger, mediaUpload,
// driveUtils. The pure date/RAG helpers (maintenanceHelpers) are left REAL so
// the recurrence-date arithmetic is exercised for real. The creator id comes from
// supabase.auth.getSession() (mocked below).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  let tables = {};
  let profile = { is_contractor: false };
  let updateExtra = {};   // extra fields merged into api.update return (e.g. regime_id)

  const api = {
    get:        vi.fn((table) => Promise.resolve(tables[table] ?? [])),
    getById:    vi.fn(() => Promise.resolve(profile)),
    create:     vi.fn((table, data) => Promise.resolve({ id: `${table}-${Math.random().toString(36).slice(2, 7)}`, ...data })),
    update:     vi.fn((table, id, data) => Promise.resolve({ id, ...updateExtra, ...data })),
    delete:     vi.fn(() => Promise.resolve()),
    deleteMany: vi.fn(() => Promise.resolve()),
    createMany: vi.fn(() => Promise.resolve([])),
  };
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
  };
});

vi.mock('$lib/supabaseClient',      () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/api',           () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger',   () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',        () => ({ getLogger: () => () => {} }));
vi.mock('$lib/utils/mediaUpload.js',() => ({ uploadMedia: h.uploadMedia }));
vi.mock('$lib/utils/driveUtils.js', () => ({ deleteStorageFiles: vi.fn(() => Promise.resolve()) }));

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
  it('marks the job completed and spawns the next recurrence from the regime frequency', async () => {
    h.setTables({ maintenance_regime: [{ id: 'reg1', task_name: 'Service', frequency_days: 30, type_id: 'ty1' }] });
    await maintenanceStore.load();
    // the completed job carries a regime_id so a recurrence is due
    h.setUpdateExtra({ regime_id: 'reg1', scope_type: 'system', scope_id: 'sys1', scope_label: 'Fire', title: 'Service', description: 'd' });

    await maintenanceStore.completeJob('j1', { result: 'pass', completedDate: '2026-01-01', createNextJob: true });

    expect(lastJobUpdate()).toMatchObject({ next_job_id: expect.any(String) });
    const nextCreate = jobCreates()[0][1];
    expect(nextCreate).toMatchObject({ regime_id: 'reg1', status: 'scheduled', scheduled_date: '2026-01-31' }); // +30 days
  });

  it('does NOT spawn a recurrence when the job has no regime', async () => {
    h.setUpdateExtra({});   // no regime_id on the returned row
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
  const sel = [{ regime_id: 'reg1', scope_type: 'system', scope_id: 'sys1', scope_label: 'Fire', title: 'Service' }];

  beforeEach(async () => {
    h.setTables({ maintenance_regime: [{ id: 'reg1', task_name: 'Service', frequency_days: 30, type_id: 'ty1' }] });
    await maintenanceStore.load();
  });

  it('walks the date range at the regime frequency', async () => {
    const created = await maintenanceStore.generateJobs(sel, '2026-01-01', '2026-02-15');
    // 2026-01-01, +30 = 2026-01-31, +30 = 2026-03-02 (> toDate, stop) → 2 jobs
    expect(created.map(j => j.scheduled_date)).toEqual(['2026-01-01', '2026-01-31']);
  });

  it('skips dates that already have a job (idempotent on a second run)', async () => {
    await maintenanceStore.generateJobs(sel, '2026-01-01', '2026-02-15');
    const second = await maintenanceStore.generateJobs(sel, '2026-01-01', '2026-02-15');
    expect(second).toHaveLength(0);
  });
});
