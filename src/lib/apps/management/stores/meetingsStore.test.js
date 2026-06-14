// src/lib/apps/management/stores/meetingsStore.test.js
//
// CHARACTERIZATION tests for meetingsStore — pin the public contract (DB calls
// + resulting state), not internals. Seams mocked: supabaseClient (auth +
// realtime), api, auditLogger, logger. See issuesStore.test.js for the template.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  const supabase = {
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1', email: 'u@x' } } })) },
    channel: vi.fn(() => {
      const ch = {};
      ch.on = vi.fn(() => ch);
      ch.subscribe = vi.fn(() => ch);
      ch.unsubscribe = vi.fn();
      return ch;
    }),
    removeChannel: vi.fn(),
  };
  const api = {
    get:     vi.fn(() => Promise.resolve([])),
    getById: vi.fn(() => Promise.resolve({ id: 'm1', title: 'before' })),
    create:  vi.fn((t, d) => Promise.resolve({ id: 'm1', title: d.title, ...d })),
    update:  vi.fn((t, id, d) => Promise.resolve({ id, title: 'T', ...d })),
    delete:  vi.fn(() => Promise.resolve()),
  };
  return { supabase, api, logAudit: vi.fn() };
});

vi.mock('$lib/supabaseClient',    () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/api',         () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',      () => ({ getLogger: () => () => {} }));

const { meetingsStore } = await import('./meetingsStore.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.api.get.mockResolvedValue([]);
});

describe('load', () => {
  it('sorts newest-first and derives the single open meeting as current', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: 'a', meeting_date: '2026-01-01', created_at: '2026-01-01', status: 'closed', title: 'Jan' },
      { id: 'b', meeting_date: '2026-03-01', created_at: '2026-03-01', status: 'open',   title: 'Mar' },
      { id: 'c', meeting_date: '2026-02-01', created_at: '2026-02-01', status: 'closed', title: 'Feb' },
    ]);
    await meetingsStore.load();
    const s = get(meetingsStore);
    expect(s.list.map(m => m.id)).toEqual(['b', 'c', 'a']); // meeting_date desc
    expect(s.current.id).toBe('b');                          // the open one
    expect(s.loaded).toBe(true);
    expect(h.api.get).toHaveBeenCalledWith('meetings', expect.objectContaining({ orderBy: 'meeting_date', ascending: false }));
  });

  it('current is null when no meeting is open', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'a', meeting_date: '2026-01-01', created_at: '2026-01-01', status: 'closed' }]);
    await meetingsStore.load();
    expect(get(meetingsStore).current).toBeNull();
  });

  it('records the error and still flips loaded on failure', async () => {
    h.api.get.mockRejectedValueOnce(new Error('db down'));
    await meetingsStore.load();
    const s = get(meetingsStore);
    expect(s.error).toBe('db down');
    expect(s.loaded).toBe(true);
  });
});

describe('create', () => {
  it('opens immediately → status open, stamps opened_at, audits + reloads', async () => {
    const r = await meetingsStore.create({ title: 'Q2', meeting_date: '2026-04-01', openImmediately: true });
    expect(r.success).toBe(true);
    const arg = h.api.create.mock.calls[0][1];
    expect(arg).toMatchObject({ title: 'Q2', status: 'open', meeting_type: 'team_progress', created_by: 'u1' });
    expect(arg.opened_at).toBeTruthy();
    expect(arg.closed_at).toBeNull();
    expect(h.logAudit).toHaveBeenCalled();
    expect(h.api.get).toHaveBeenCalled(); // reload
  });

  it('defaults to closed when not opening immediately', async () => {
    await meetingsStore.create({ title: 'Later', meeting_date: '2026-05-01' });
    const arg = h.api.create.mock.calls[0][1];
    expect(arg.status).toBe('closed');
    expect(arg.closed_at).toBeTruthy();
  });

  it('maps the single-open unique-index conflict to a friendly message', async () => {
    h.api.create.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "meetings_one_open"'));
    const r = await meetingsStore.create({ title: 'X', meeting_date: '2026-01-01', openImmediately: true });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/already open/i);
  });
});

describe('update', () => {
  it('writes only the allow-listed columns (drops UI-only fields)', async () => {
    await meetingsStore.updateMeeting('m1', {
      title: 'New', meeting_date: '2026-06-01', notes: 'n',
      openImmediately: true, bogus: 'x',            // UI-only / unknown — must be dropped
    });
    const patch = h.api.update.mock.calls[0][2];
    expect(patch).toMatchObject({ title: 'New', meeting_date: '2026-06-01', notes: 'n', updated_by: 'u1' });
    expect(patch).not.toHaveProperty('openImmediately');
    expect(patch).not.toHaveProperty('bogus');
  });
});

describe('open / close', () => {
  it('open flips status to open and clears closed_at', async () => {
    await meetingsStore.open('m1');
    const patch = h.api.update.mock.calls[0][2];
    expect(patch).toMatchObject({ status: 'open', closed_at: null });
    expect(patch.opened_at).toBeTruthy();
  });

  it('open maps the single-open conflict to a friendly message', async () => {
    h.api.update.mockRejectedValueOnce(new Error('violates "meetings_one_open"'));
    const r = await meetingsStore.open('m1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/already open/i);
  });

  it('close flips status to closed and stamps closed_at', async () => {
    await meetingsStore.close('m1');
    const patch = h.api.update.mock.calls[0][2];
    expect(patch.status).toBe('closed');
    expect(patch.closed_at).toBeTruthy();
  });
});

describe('delete', () => {
  it('reads before-state, deletes, audits as warning, reloads', async () => {
    h.api.getById.mockResolvedValueOnce({ id: 'm1', title: 'Doomed' });
    const r = await meetingsStore.delete('m1');
    expect(r.success).toBe(true);
    expect(h.api.delete).toHaveBeenCalledWith('meetings', 'm1');
    expect(h.logAudit).toHaveBeenCalledWith('delete', 'meeting', 'm1', 'Doomed', expect.objectContaining({ severity: 'warning' }));
    expect(h.api.get).toHaveBeenCalled();
  });
});

describe('untagItem', () => {
  it('rejects an unsupported table without writing', async () => {
    const r = await meetingsStore.untagItem('widgets', 'x');
    expect(r.success).toBe(false);
    expect(h.api.update).not.toHaveBeenCalled();
  });

  it('nulls meeting_id on a supported table and maps the target type', async () => {
    await meetingsStore.untagItem('activities', 'act1');
    expect(h.api.update).toHaveBeenCalledWith('activities', 'act1', expect.objectContaining({ meeting_id: null, updated_by: 'u1' }));
    expect(h.logAudit).toHaveBeenCalledWith('update', 'activity', 'act1', expect.any(String), expect.objectContaining({ eventAction: 'untag_meeting' }));
  });
});

describe('realtime', () => {
  it('subscribes once and removes the channel on cleanup', () => {
    meetingsStore.initializeRealtime();
    meetingsStore.initializeRealtime(); // idempotent
    expect(h.supabase.channel).toHaveBeenCalledTimes(1);
    meetingsStore.cleanup();
    expect(h.supabase.removeChannel).toHaveBeenCalled();
  });
});
