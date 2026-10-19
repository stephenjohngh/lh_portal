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
const { api, getSession, logAudit, pub } = vi.hoisted(() => ({
  api: { getAll: vi.fn(), get: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn() },
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })),
  logAudit: vi.fn(),
  pub: {
    registerDocument: vi.fn(),
    scheduleOneCompleteness: vi.fn(async () => []),
    listCitations: vi.fn(async () => []),
    listDocumentLinks: vi.fn(async () => []),
    cite: vi.fn(),
    removeLink: vi.fn(),
    listPersons: vi.fn(async () => []),
    createPerson: vi.fn(),
    listAuditHistory: vi.fn(async () => []),
    listSafetyCaseNotifications: vi.fn(async () => []),
    createSafetyCaseNotification: vi.fn(),
    markSafetyCaseNotified: vi.fn(),
  }
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
const { registerDocument } = pub;

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

// Migration 264: a document moves through the shared workflow manager. The
// database makes the change (one UPDATE of the row, so gt_audit chains it as
// before) — ⛔ the store must never write gt_documents.status itself.
describe('gtStore.moveDocument — through the workflow', () => {
  /** Load a register with one document in the workflow at `step`. */
  async function withItem(step) {
    wfApi.loadWorkflow.mockResolvedValueOnce({ workflow: { id: 'wf' }, steps: [], moves: [], fields: [] });
    wfApi.listItems.mockResolvedValueOnce([{ id: 'item-1', subject_id: 'd', step_key: step }]);
    api.getAll.mockResolvedValueOnce([{ id: 'd', reference: 'GT-000001', status: step }]);
    await gtStore.load();
  }

  it('moves the item, never writes the status, and audits the move', async () => {
    await withItem('under_review');
    api.getById.mockResolvedValueOnce({ id: 'd', reference: 'GT-000001', status: 'current' });
    const res = await gtStore.moveDocument('d', 'current');
    expect(res.success).toBe(true);
    expect(wfApi.moveItem).toHaveBeenCalledWith('item-1', 'current', '');
    expect(api.update).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith('update', 'gt_document', 'd', 'GT-000001',
      expect.objectContaining({ afterData: { from: 'under_review', to: 'current' } }));
  });

  it('carries the note — the reason a document is returned or withdrawn', async () => {
    await withItem('current');
    api.getById.mockResolvedValueOnce({ id: 'd', status: 'withdrawn' });
    await gtStore.moveDocument('d', 'withdrawn', 'wrong file');
    expect(wfApi.moveItem).toHaveBeenCalledWith('item-1', 'withdrawn', 'wrong file');
    expect(api.update).not.toHaveBeenCalled();
  });

  it('refuses, writing nothing, while the document is not in its workflow', async () => {
    api.getAll.mockResolvedValueOnce([{ id: 'x', status: 'draft' }]);
    await gtStore.load();
    const res = await gtStore.moveDocument('x', 'under_review');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not in its workflow/);
    expect(wfApi.moveItem).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('a refused move shows the database\'s reason and changes nothing', async () => {
    await withItem('draft');
    wfApi.moveItem.mockRejectedValueOnce(new Error('Only an administrator can do that.'));
    const res = await gtStore.moveDocument('d', 'withdrawn', 'mistake');
    expect(res).toEqual({ success: false, error: 'Only an administrator can do that.' });
    expect(api.update).not.toHaveBeenCalled();
  });
});

describe('gtStore links', () => {
  it('loadLinks splits outgoing (source) and incoming (citations)', async () => {
    pub.listDocumentLinks.mockResolvedValueOnce([{ id: 'out-1', relation: 'produced_by' }]);
    pub.listCitations.mockResolvedValueOnce([{ id: 'in-1', relation: 'evidences' }]);
    await gtStore.loadLinks('doc-1');
    expect(pub.listDocumentLinks).toHaveBeenCalledWith('doc-1');
    expect(pub.listCitations).toHaveBeenCalledWith('doc-1');
    expect(get(gtStore).links).toEqual({
      outgoing: [{ id: 'out-1', relation: 'produced_by' }],
      incoming: [{ id: 'in-1', relation: 'evidences' }]
    });
  });

  it('addLink cites with the actor and reloads links', async () => {
    pub.cite.mockResolvedValueOnce({ id: 'link-1' });
    pub.listDocumentLinks.mockResolvedValueOnce([]);
    pub.listCitations.mockResolvedValueOnce([]);
    const payload = { targetType: 'mor_case', targetId: 'case-9', relation: 'evidences', note: '' };
    const res = await gtStore.addLink('doc-1', payload);
    expect(res.success).toBe(true);
    expect(pub.cite).toHaveBeenCalledWith('doc-1', payload, 'user-1');
    expect(logAudit).toHaveBeenCalledWith('create', 'gt_link', 'doc-1', 'evidences', expect.any(Object));
    expect(pub.listCitations).toHaveBeenCalledWith('doc-1'); // reloaded
  });
});

describe('gtStore people & audit', () => {
  it('addPerson creates with the actor and refreshes the registry', async () => {
    pub.createPerson.mockResolvedValueOnce({ id: 'p1', full_name: 'Jo Bloggs' });
    pub.listPersons.mockResolvedValueOnce([{ id: 'p1', full_name: 'Jo Bloggs', role: 'author' }]);
    const res = await gtStore.addPerson({ full_name: 'Jo Bloggs', role: 'author' });
    expect(res.success).toBe(true);
    expect(pub.createPerson).toHaveBeenCalledWith({ full_name: 'Jo Bloggs', role: 'author' }, 'user-1');
    expect(get(gtStore).persons).toHaveLength(1);
  });

  it('addSafetyCaseNotification logs the revision and refreshes the list', async () => {
    pub.createSafetyCaseNotification.mockResolvedValueOnce({ id: 'n1', description: 'Annual update' });
    pub.listSafetyCaseNotifications.mockResolvedValueOnce([{ id: 'n1', description: 'Annual update', notified_at: null }]);
    const res = await gtStore.addSafetyCaseNotification({ description: 'Annual update', reason: null });
    expect(res.success).toBe(true);
    expect(pub.createSafetyCaseNotification).toHaveBeenCalledWith({ description: 'Annual update', reason: null }, 'user-1');
    expect(get(gtStore).safetyCaseNotifications).toHaveLength(1);
  });

  it('notifyRegulator marks it notified and refreshes the list', async () => {
    pub.listSafetyCaseNotifications.mockResolvedValueOnce([]);
    const res = await gtStore.notifyRegulator('n1', { notification_reference: 'REF-1' });
    expect(res.success).toBe(true);
    expect(pub.markSafetyCaseNotified).toHaveBeenCalledWith('n1', { notification_reference: 'REF-1' }, 'user-1');
  });

  it('loadAuditHistory falls back to empty when RLS blocks a non-admin', async () => {
    pub.listAuditHistory.mockRejectedValueOnce(new Error('permission denied'));
    // Resolves (does not throw) and yields an empty list rather than surfacing an error.
    await expect(gtStore.loadAuditHistory('doc-1')).resolves.toBeUndefined();
    expect(get(gtStore).auditHistory).toEqual([]);
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
