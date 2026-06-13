// src/lib/apps/management/stores/issuesStore.test.js
//
// CHARACTERIZATION tests for issuesStore — they pin the store's PUBLIC
// CONTRACT (what DB calls each method makes + the resulting store state), not
// its internals. That's the point: you can later extract the repeated
// boilerplate or split the store into modules and these tests still pass,
// because they only assert observable behaviour at the store's edges.
//
// ── Template for testing any store ──────────────────────────────────────────
// Stores route all I/O through a few seams; mock those and the rest is pure.
// The mocks live in vi.hoisted() because vi.mock() factories are hoisted above
// imports — anything the factory references must be defined there, not imported.
// Mock every dependency that (a) does I/O you want to control, or (b)
// transitively pulls in $env/$app (which don't resolve without the SvelteKit
// vite plugin). For issuesStore that's: supabaseClient, api, auditLogger,
// logger, sanitizeHtml, meetingsStore. constants.js is pure → left real.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  // NB: vi.hoisted runs before imports, so we can't use `writable` here — the
  // meeting store is a hand-rolled subscribe-only store that get() works on.
  let singleResult = { data: { id: 'x', issue_number: 1, name: 'n' }, error: null };
  let awaitResult  = { data: [], error: null };

  // Chainable Supabase query-builder mock. Every chain method returns the
  // builder; .single() resolves singleResult; awaiting the builder itself
  // (e.g. the .in() terminal in assignToMeeting) resolves awaitResult.
  const makeBuilder = () => {
    const b = {};
    const chain = () => b;
    for (const m of ['insert', 'update', 'delete', 'select', 'eq', 'in', 'neq', 'order', 'gte', 'lte', 'or']) {
      b[m] = vi.fn(chain);
    }
    b.single = vi.fn(() => Promise.resolve(singleResult));
    b.then = (res, rej) => Promise.resolve(awaitResult).then(res, rej);
    return b;
  };

  const supabase = {
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1', email: 'u@example.com' } } })) },
    from: vi.fn(() => makeBuilder()),
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
    get:        vi.fn(() => Promise.resolve([])),
    update:     vi.fn(() => Promise.resolve({})),
    delete:     vi.fn(() => Promise.resolve()),
    updateMany: vi.fn(() => Promise.resolve([])),
    create:     vi.fn(() => Promise.resolve({})),
  };

  const logAudit     = vi.fn();
  const sanitizeHtml = vi.fn((s) => s);          // identity — assert it's CALLED

  // Subscribe-only store so get(currentMeeting) returns the current value.
  let meetingVal = null;
  const currentMeeting = { subscribe: (run) => { run(meetingVal); return () => {}; } };

  return { supabase, api, logAudit, sanitizeHtml, currentMeeting,
           setSingle:  (r) => { singleResult = r; },
           setAwait:   (r) => { awaitResult = r; },
           setMeeting: (v) => { meetingVal = v; } };
});

vi.mock('$lib/supabaseClient',     () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/api',          () => ({ api: h.api }));
vi.mock('$lib/utils/auditLogger',  () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',       () => ({ getLogger: () => () => {} }));
vi.mock('$lib/utils/sanitizeHtml', () => ({ sanitizeHtml: h.sanitizeHtml }));
vi.mock('../../management/stores/meetingsStore', () => ({ currentMeeting: h.currentMeeting }));
vi.mock('./meetingsStore',         () => ({ currentMeeting: h.currentMeeting }));

const { issuesStore } = await import('./issuesStore.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.api.get.mockResolvedValue([]);
  h.setSingle({ data: { id: 'x', issue_number: 1, name: 'n' }, error: null });
  h.setAwait({ data: [], error: null });
  h.setMeeting(null);
});

// ── fetchIssues ──────────────────────────────────────────────────────────────
describe('fetchIssues', () => {
  it('loads issues and sorts by priority then issue_number', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: 'b', priority: 2, issue_number: 5 },
      { id: 'a', priority: 1, issue_number: 9 },
      { id: 'c', priority: 1, issue_number: 2 },
    ]);
    await issuesStore.fetchIssues();
    const s = get(issuesStore);
    expect(s.issues.map(i => i.id)).toEqual(['c', 'a', 'b']); // p1#2, p1#9, p2#5
    expect(s.loading).toBe(false);
    expect(h.api.get).toHaveBeenCalledWith('issues', expect.objectContaining({ orderBy: 'priority', ascending: true }));
  });

  it('sets error and clears loading on failure', async () => {
    h.api.get.mockRejectedValueOnce(new Error('db down'));
    await issuesStore.fetchIssues();
    const s = get(issuesStore);
    expect(s.error).toBe('db down');
    expect(s.loading).toBe(false);
  });
});

// ── Issues ─────────────────────────────────────────────────────────────────
describe('addIssue', () => {
  it('inserts with parsed priority + default status, then refetches', async () => {
    h.setSingle({ data: { id: 'i1', issue_number: 7, name: 'Leak', meeting_id: null }, error: null });
    h.api.get.mockResolvedValueOnce([{ id: 'i1', priority: 2, issue_number: 7 }]);

    const r = await issuesStore.addIssue({ name: 'Leak', description: 'd', priority: '2' });

    expect(r).toEqual({ success: true });
    expect(h.supabase.from).toHaveBeenCalledWith('issues');
    const insertArg = h.supabase.from.mock.results
      .map(r => r.value).find(b => b.insert.mock.calls.length)?.insert.mock.calls[0][0];
    expect(insertArg).toMatchObject({ name: 'Leak', priority: 2, status: 'current', created_by: 'u1' });
    expect(get(issuesStore).issues).toHaveLength(1);
  });

  it('defaults priority to 3 when unparseable', async () => {
    await issuesStore.addIssue({ name: 'X', description: '', priority: 'oops' });
    const insertArg = h.supabase.from.mock.results
      .map(r => r.value).find(b => b.insert.mock.calls.length)?.insert.mock.calls[0][0];
    expect(insertArg.priority).toBe(3);
  });

  it('tags the issue with the active meeting id when a meeting is open', async () => {
    h.setMeeting({ id: "m9" });
    await issuesStore.addIssue({ name: 'X', description: '', priority: '1' });
    const insertArg = h.supabase.from.mock.results
      .map(r => r.value).find(b => b.insert.mock.calls.length)?.insert.mock.calls[0][0];
    expect(insertArg.meeting_id).toBe('m9');
  });

  it('returns failure (does not throw) when the insert errors', async () => {
    h.setSingle({ data: null, error: new Error('insert failed') });
    const r = await issuesStore.addIssue({ name: 'X', description: '', priority: '1' });
    expect(r).toEqual({ success: false, error: 'insert failed' });
    expect(get(issuesStore).error).toBe('insert failed');
  });
});

describe('updateIssue', () => {
  it('updates via api.update and honours admin override timestamps', async () => {
    h.setSingle({ data: { issue_number: 3, name: 'old' }, error: null });
    await issuesStore.updateIssue('i1', {
      name: 'new', description: 'd', priority: '1', status: 'current',
      override_created_at: '2020-01-01T00:00:00Z',
      override_updated_at: '2020-02-02T00:00:00Z',
    });
    expect(h.api.update).toHaveBeenCalledWith('issues', 'i1', expect.objectContaining({
      name: 'new', created_at: '2020-01-01T00:00:00Z', updated_at: '2020-02-02T00:00:00Z',
    }));
  });
});

describe('deleteIssue', () => {
  it('deletes via api.delete and refetches', async () => {
    const r = await issuesStore.deleteIssue('i1');
    expect(h.api.delete).toHaveBeenCalledWith('issues', 'i1');
    expect(h.api.get).toHaveBeenCalled(); // refetch
    expect(r).toEqual({ success: true });
  });
});

// ── Activities ───────────────────────────────────────────────────────────────
describe('addActivity', () => {
  it('sanitises the body at the write boundary before inserting', async () => {
    await issuesStore.addActivity('i1', { body: '<b>hi</b>', activity_type: 'comment' });
    expect(h.sanitizeHtml).toHaveBeenCalledWith('<b>hi</b>');
    expect(h.supabase.from).toHaveBeenCalledWith('activities');
  });
});

describe('moveActivity', () => {
  it('moves the activity and re-parents its source-linked actions', async () => {
    h.setSingle({ data: { activity_type: 'comment', issue_id: 'src' }, error: null });
    await issuesStore.moveActivity('act1', 'dst');
    expect(h.api.update).toHaveBeenCalledWith('activities', 'act1', expect.objectContaining({ issue_id: 'dst' }));
    expect(h.api.updateMany).toHaveBeenCalledWith(
      'actions', { source_activity_id: 'act1' }, expect.objectContaining({ issue_id: 'dst' }), false,
    );
  });
});

// ── Actions ──────────────────────────────────────────────────────────────────
describe('addAction', () => {
  it('inserts an action defaulting source_activity_id to null', async () => {
    await issuesStore.addAction('i1', { action_text: 'do it', name_text: 'A', status: 'open' });
    const insertArg = h.supabase.from.mock.results
      .map(r => r.value).find(b => b.insert.mock.calls.length)?.insert.mock.calls[0][0];
    expect(insertArg).toMatchObject({ action_text: 'do it', source_activity_id: null, issue_id: 'i1' });
  });
});

// ── assignToMeeting ──────────────────────────────────────────────────────────
describe('assignToMeeting', () => {
  it('no-ops (success, no writes) when nothing is selected', async () => {
    const r = await issuesStore.assignToMeeting('m1', {});
    expect(r).toEqual({ success: true });
    expect(h.supabase.from).not.toHaveBeenCalled();
  });

  it('updates each selected entity table when ids are given', async () => {
    await issuesStore.assignToMeeting('m1', { issueIds: ['i1'], actionIds: ['a1'] });
    expect(h.supabase.from).toHaveBeenCalledWith('issues');
    expect(h.supabase.from).toHaveBeenCalledWith('actions');
    expect(h.supabase.from).not.toHaveBeenCalledWith('activities'); // none selected
  });
});

// ── Realtime wiring + misc ───────────────────────────────────────────────────
describe('realtime + clearError', () => {
  it('subscribes to issues/activities/actions changes on initializeRealtime', () => {
    issuesStore.initializeRealtime();
    expect(h.supabase.channel).toHaveBeenCalledWith('issues-changes');
    const ch = h.supabase.channel.mock.results[0].value;
    expect(ch.on).toHaveBeenCalledTimes(5); // issues x3 events + activities + actions
    expect(ch.subscribe).toHaveBeenCalled();
  });

  it('removes the channel on cleanup', () => {
    issuesStore.initializeRealtime();
    issuesStore.cleanup();
    expect(h.supabase.removeChannel).toHaveBeenCalled();
  });

  it('clearError resets the error field', async () => {
    h.api.get.mockRejectedValueOnce(new Error('x'));
    await issuesStore.fetchIssues();
    expect(get(issuesStore).error).toBe('x');
    issuesStore.clearError();
    expect(get(issuesStore).error).toBe('');
  });
});
