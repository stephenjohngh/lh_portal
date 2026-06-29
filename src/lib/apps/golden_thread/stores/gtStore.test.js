// src/lib/apps/golden_thread/stores/gtStore.test.js
//
// Store-contract tests (CLAUDE.md testing blueprint): mock the I/O seams
// (api.js, supabaseClient, auditLogger, logger, public.js) and assert which DB
// calls each method makes + the resulting store state. The lifecycle truth table
// itself is pinned separately by gtLifecycle.test.js.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// vi.mock factories hoist above imports, so the mock objects must live in
// vi.hoisted() (CLAUDE.md testing blueprint).
const { api, getUser, logAudit, registerDocument, scheduleOneCompleteness } = vi.hoisted(() => ({
  api: { getAll: vi.fn(), get: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn() },
  getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
  logAudit: vi.fn(),
  registerDocument: vi.fn(),
  scheduleOneCompleteness: vi.fn(async () => [])
}));

vi.mock('$lib/utils/api', () => ({ api }));
vi.mock('$lib/supabaseClient', () => ({ supabase: { auth: { getUser } } }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$lib/apps/golden_thread/public.js', () => ({ registerDocument, scheduleOneCompleteness }));

import { gtStore } from './gtStore.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('gtStore.createDraft', () => {
  it('delegates to registerDocument and splices the draft into the register', async () => {
    const draft = { id: 'doc-1', title: 'Fire strategy', reference: 'GT-000001',
                    schedule1_category: 7, document_type: 'Strategy', status: 'draft' };
    registerDocument.mockResolvedValueOnce(draft);

    const meta = { schedule1_category: 7, document_type: 'Strategy', title: 'Fire strategy', file: new Blob(['x']) };
    const res = await gtStore.createDraft(meta, null);

    expect(res.success).toBe(true);
    expect(registerDocument).toHaveBeenCalledWith(meta, null, 'user-1');
    expect(get(gtStore).documents.find((d) => d.id === 'doc-1')).toBeTruthy();
    expect(logAudit).toHaveBeenCalledWith('create', 'gt_document', 'doc-1', 'Fire strategy', expect.any(Object));
  });

  it('surfaces a failure without throwing', async () => {
    registerDocument.mockRejectedValueOnce(new Error('upload boom'));
    const res = await gtStore.createDraft({ file: new Blob(['x']) }, null);
    expect(res).toEqual({ success: false, error: 'upload boom' });
    expect(get(gtStore).error).toBe('upload boom');
  });
});

describe('gtStore.accept — supersession rule', () => {
  it('sets the accepted doc current and marks the prior superseded', async () => {
    // Accepted doc supersedes prior; carries a 365-day review cycle.
    const accepted = { id: 'new', title: 'V2', status: 'under_review', supersedes: 'old', review_cycle_days: 365 };
    const prior    = { id: 'old', title: 'V1', status: 'current' };
    api.getById.mockImplementation(async (_t, id) => (id === 'new' ? accepted : prior));
    api.update.mockImplementation(async (_t, id, data) => ({ id, ...data }));

    const res = await gtStore.accept('new');
    expect(res.success).toBe(true);

    // First update: new → current with effective_from + computed review_due
    const acceptCall = api.update.mock.calls.find((c) => c[1] === 'new');
    expect(acceptCall[2].status).toBe('current');
    expect(acceptCall[2].effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(acceptCall[2].review_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Second update: prior → superseded, effective_to set, superseded_by = new
    const priorCall = api.update.mock.calls.find((c) => c[1] === 'old');
    expect(priorCall[2]).toMatchObject({ status: 'superseded', superseded_by: 'new' });
    expect(priorCall[2].effective_to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects an invalid transition before touching the DB', async () => {
    api.getById.mockResolvedValueOnce({ id: 'd', title: 'X', status: 'draft' }); // draft can't go straight to current
    const res = await gtStore.accept('d');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid GT status transition/);
    expect(api.update).not.toHaveBeenCalled();
  });
});

describe('gtStore.load', () => {
  it('loads the register newest-first into state', async () => {
    api.getAll.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    await gtStore.load();
    expect(api.getAll).toHaveBeenCalledWith('gt_documents', { orderBy: 'created_at', ascending: false });
    expect(get(gtStore).documents).toHaveLength(2);
    expect(get(gtStore).loading).toBe(false);
  });
});
