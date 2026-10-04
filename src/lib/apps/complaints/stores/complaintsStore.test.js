// src/lib/apps/complaints/stores/complaintsStore.test.js
//
// ComplaintsApp catches every store call's throw and shows `state.error`
// instead, on the understanding that the store has set it. addNote and
// recordEscalationTold did not, so a failure vanished: the person believed a
// note — or the record that the complainant was told of their right to escalate,
// evidence of the BSA s.93 duty — was saved (2026-10-03, PROJECT_STATUS §6ccc
// item 2). Seams mocked: api, supabaseClient (the session), auditLogger, logger.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({
  api: { get: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getAll: vi.fn() },
}));
vi.mock('#lib/utils/api.js', () => ({ api: h.api }));
vi.mock('#lib/supabaseClient.js', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'u@x' } } } }) } },
}));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { complaintsStore } = await import('./complaintsStore.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.api.getById.mockResolvedValue({ id: 'u1', full_name: 'Sam' });
  h.api.get.mockResolvedValue([]);
  complaintsStore.clearError();
});

describe('a write that fails shows why, and still throws', () => {
  it('addNote', async () => {
    h.api.create.mockRejectedValueOnce(new Error('Note not saved: offline'));
    await expect(complaintsStore.addNote('c1', 'Called back')).rejects.toThrow('offline');
    expect(get(complaintsStore).error).toMatch(/offline/);
  });

  it('recordEscalationTold — the evidence of the s.93 duty', async () => {
    h.api.update.mockRejectedValueOnce({ message: 'permission denied' });   // a plain Supabase error
    await expect(complaintsStore.recordEscalationTold('c1')).rejects.toBeTruthy();
    expect(get(complaintsStore).error).toBe('permission denied');
  });

  it('clears the previous error when a write is tried again', async () => {
    h.api.create.mockRejectedValueOnce(new Error('first'));
    await expect(complaintsStore.addNote('c1', 'x')).rejects.toThrow();
    h.api.create.mockResolvedValueOnce({ id: 't1', entry_type: 'note', content: 'x' });
    await complaintsStore.addNote('c1', 'x');
    expect(get(complaintsStore).error).toBeNull();
  });
});
