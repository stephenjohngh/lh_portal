// src/lib/apps/admin/stores/auditLogsStore.test.js
// CHARACTERIZATION tests for auditLogsStore. Pins query-filter wiring,
// pagination (offset 0 replaces, >0 appends + hasMore), flag/unflag/delete
// state patching, and the getStats aggregation. CSV export touches the DOM and
// is out of scope here. Seam mocked: supabaseClient (a chainable builder that
// resolves a configurable { data, error, count }).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  let result = { data: [], error: null, count: 0 };
  // Builder where every method returns the builder, and awaiting the builder
  // resolves `result` (covers .range(), the trailing .eq()/.in(), and .gte()).
  const makeBuilder = () => {
    const b = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'gte', 'lte', 'or', 'order', 'range', 'update', 'delete', 'insert', 'in']) {
      b[m] = vi.fn(chain);
    }
    b.then = (res, rej) => Promise.resolve(result).then(res, rej);
    return b;
  };
  const supabase = { from: vi.fn(() => makeBuilder()) };
  return { supabase, setResult: (r) => { result = r; } };
});

vi.mock('$lib/supabaseClient', () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/logger',   () => ({ getLogger: () => () => {} }));

const { auditLogsStore } = await import('./auditLogsStore.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.setResult({ data: [], error: null, count: 0 });
  auditLogsStore.reset();
});

describe('fetchLogs', () => {
  it('applies the given filters to the query and stores results + hasMore', async () => {
    h.setResult({ data: [{ id: 'l1' }, { id: 'l2' }], error: null, count: 250 });
    await auditLogsStore.fetchLogs({ appId: 'mor', severity: 'critical', limit: 100, offset: 0 });
    const b = h.supabase.from.mock.results[0].value;
    expect(b.eq).toHaveBeenCalledWith('app_id', 'mor');
    expect(b.eq).toHaveBeenCalledWith('severity', 'critical');
    expect(b.range).toHaveBeenCalledWith(0, 99);
    const s = get(auditLogsStore);
    expect(s.logs).toHaveLength(2);
    expect(s.totalCount).toBe(250);
    expect(s.hasMore).toBe(true);   // 0+100 < 250
  });

  it('appends (not replaces) when offset > 0', async () => {
    h.setResult({ data: [{ id: 'l1' }], error: null, count: 2 });
    await auditLogsStore.fetchLogs({ offset: 0, limit: 1 });
    h.setResult({ data: [{ id: 'l2' }], error: null, count: 2 });
    await auditLogsStore.fetchLogs({ offset: 1, limit: 1 });
    expect(get(auditLogsStore).logs.map(l => l.id)).toEqual(['l1', 'l2']);
    expect(get(auditLogsStore).hasMore).toBe(false);  // 1+1 not < 2
  });

  it('captures the error and clears loading on failure', async () => {
    h.setResult({ data: null, error: new Error('rls'), count: null });
    await auditLogsStore.fetchLogs({});
    expect(get(auditLogsStore).error).toBe('rls');
    expect(get(auditLogsStore).loading).toBe(false);
  });

  it('search builds an OR ilike across user_email and target_name', async () => {
    await auditLogsStore.fetchLogs({ search: 'alice' });
    const b = h.supabase.from.mock.results[0].value;
    expect(b.or).toHaveBeenCalledWith('user_email.ilike.%alice%,target_name.ilike.%alice%');
  });
});

describe('flag / unflag / delete', () => {
  beforeEach(async () => {
    h.setResult({ data: [{ id: 'l1', flagged: false }, { id: 'l2', flagged: false }], error: null, count: 2 });
    await auditLogsStore.fetchLogs({ offset: 0 });
    h.setResult({ data: null, error: null });   // mutations resolve { error: null }
  });

  it('flagLog marks the row flagged in state', async () => {
    await auditLogsStore.flagLog('l1', 'suspicious');
    expect(get(auditLogsStore).logs.find(l => l.id === 'l1').flagged).toBe(true);
  });

  it('unflagLog clears the flag in state', async () => {
    await auditLogsStore.flagLog('l1', 'x');
    await auditLogsStore.unflagLog('l1');
    expect(get(auditLogsStore).logs.find(l => l.id === 'l1').flagged).toBe(false);
  });

  it('deleteLog removes the row and decrements the count', async () => {
    await auditLogsStore.deleteLog('l1');
    const s = get(auditLogsStore);
    expect(s.logs.map(l => l.id)).toEqual(['l2']);
    expect(s.totalCount).toBe(1);
  });

  it('deleteLogs removes several rows and decrements the count', async () => {
    await auditLogsStore.deleteLogs(['l1', 'l2']);
    const s = get(auditLogsStore);
    expect(s.logs).toHaveLength(0);
    expect(s.totalCount).toBe(0);
  });

  it('flagLog throws (surfaces) on a DB error', async () => {
    h.setResult({ data: null, error: new Error('denied') });
    await expect(auditLogsStore.flagLog('l1', 'x')).rejects.toThrow('denied');
  });
});

describe('getStats', () => {
  it('aggregates events by type / category / severity / flagged', async () => {
    h.setResult({ data: [
      { event_type: 'login',        event_category: 'auth',   severity: 'info',     flagged: false },
      { event_type: 'failed_login', event_category: 'auth',   severity: 'warning',  flagged: true  },
      { event_type: 'create',       event_category: 'issues', severity: 'info',     flagged: false },
      { event_type: 'delete',       event_category: 'plans',  severity: 'critical', flagged: false, app_id: 'plans' },
    ], error: null });
    const stats = await auditLogsStore.getStats(30);
    expect(stats.totalEvents).toBe(4);
    expect(stats.totalLogins).toBe(1);
    expect(stats.failedLogins).toBe(1);
    expect(stats.dataChanges).toBe(2);     // create + delete
    expect(stats.criticalEvents).toBe(1);
    expect(stats.flaggedEvents).toBe(1);
    expect(stats.authEvents).toBe(2);
    expect(stats.planEvents).toBe(1);
  });
});

describe('reset / clearError', () => {
  it('reset returns the store to its empty initial state', async () => {
    h.setResult({ data: [{ id: 'l1' }], error: null, count: 1 });
    await auditLogsStore.fetchLogs({});
    auditLogsStore.reset();
    expect(get(auditLogsStore)).toMatchObject({ logs: [], totalCount: 0, hasMore: false, currentFilters: null });
  });
});
