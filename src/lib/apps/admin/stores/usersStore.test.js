// src/lib/apps/admin/stores/usersStore.test.js
// CHARACTERIZATION tests for usersStore. Admin actions go through /api/admin/*
// (fetch + bearer header — never a user id in the body); permission edits go
// straight to app_permissions / profiles via supabase. Pins the role→flag
// mapping, the per-app access-level transitions, and the sub-store updates.
// Seams mocked: api, supabaseClient, authHeaders, logger, fetch.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  let result = { data: [], error: null };
  const makeBuilder = () => {
    const b = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'insert', 'update', 'delete']) b[m] = vi.fn(chain);
    b.then = (res, rej) => Promise.resolve(result).then(res, rej);
    return b;
  };
  const supabase = {
    from: vi.fn(() => makeBuilder()),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'admin1' } } })) },
  };
  const api = { get: vi.fn(() => Promise.resolve([])) };
  return { supabase, api, setResult: (r) => { result = r; } };
});

vi.mock('$lib/supabaseClient',   () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/api',        () => ({ api: h.api }));
vi.mock('$lib/utils/authHeaders',() => ({ authHeaders: () => Promise.resolve({ Authorization: 'Bearer tok' }) }));
vi.mock('$lib/utils/logger',     () => ({ getLogger: () => () => {} }));

const { usersStore } = await import('./usersStore.js');

function mockFetch(body, ok = true) {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();                 // createUser/deleteUser schedule a refetch
  h.setResult({ data: [], error: null });
  h.api.get.mockResolvedValue([]);
  mockFetch({ success: true });
});
afterEach(() => vi.useRealTimers());

describe('fetchUsers', () => {
  it('loads profiles newest-first into state', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]);
    await usersStore.fetchUsers();
    expect(get(usersStore).users).toHaveLength(2);
    expect(h.api.get).toHaveBeenCalledWith('profiles', expect.objectContaining({ orderBy: 'created_at', ascending: false }));
  });
});

describe('createUser', () => {
  it('POSTs to /api/admin/create-user with a bearer header (no caller id in body)', async () => {
    mockFetch({ id: 'new-user' });
    const r = await usersStore.createUser({ email: 'a@b.com', password: 'pw', fullName: 'A B' });
    expect(r).toEqual({ id: 'new-user' });
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/admin/create-user');
    expect(opts.headers).toMatchObject({ Authorization: 'Bearer tok' });
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ email: 'a@b.com', password: 'pw', full_name: 'A B' });
    expect(body).not.toHaveProperty('user_id');
  });

  it('throws the endpoint error message on failure', async () => {
    mockFetch({ error: 'email exists' }, false);
    await expect(usersStore.createUser({ email: 'a@b.com', password: 'pw' })).rejects.toThrow('email exists');
  });
});

describe('loadAppPermissions', () => {
  it('maps app_permissions rows to an app_id list in the sub-store', async () => {
    h.setResult({ data: [{ app_id: 'issues' }, { app_id: 'mor' }], error: null });
    await usersStore.loadAppPermissions('u1');
    expect(get(usersStore.appPermissions).u1).toEqual(['issues', 'mor']);
    expect(get(usersStore.loadingApps).u1).toBe(false);   // cleared in finally
  });
});

describe('toggleAppPermission', () => {
  it('inserts a permission when the user does not have it', async () => {
    h.setResult({ error: null });
    await usersStore.toggleAppPermission('u1', 'mor', ['issues']);
    expect(get(usersStore.appPermissions).u1).toEqual(['issues', 'mor']);
    // an INSERT (not a delete) was used
    const anyInsert = h.supabase.from.mock.results.some(r => r.value.insert.mock.calls.length);
    expect(anyInsert).toBe(true);
  });

  it('removes a permission the user already has', async () => {
    h.setResult({ error: null });
    await usersStore.toggleAppPermission('u1', 'issues', ['issues', 'mor']);
    expect(get(usersStore.appPermissions).u1).toEqual(['mor']);
  });
});

describe('setUserRole', () => {
  it('maps the role to profile flags and patches the user list', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'u1', is_admin: false, is_read_only: true }]);
    await usersStore.fetchUsers();
    h.setResult({ error: null });
    await usersStore.setUserRole('u1', 'admin');
    expect(get(usersStore).users.find(u => u.id === 'u1')).toMatchObject({ is_admin: true, is_read_only: false });
  });

  it('rejects an unknown role', async () => {
    await expect(usersStore.setUserRole('u1', 'wizard')).rejects.toThrow(/unknown role/i);
  });
});

describe('setAppAccessLevel', () => {
  it("'none' removes the permission and read-only entry", async () => {
    h.setResult({ error: null });
    // seed an existing permission
    await usersStore.toggleAppPermission('u1', 'mor', []);
    await usersStore.setAppAccessLevel('u1', 'mor', 'none');
    expect(get(usersStore.appPermissions).u1).toEqual([]);
  });

  it("'ro' grants the app and marks it read-only (delete-then-insert)", async () => {
    h.setResult({ error: null });
    await usersStore.setAppAccessLevel('u1', 'maintenance', 'ro');
    expect(get(usersStore.appPermissions).u1).toContain('maintenance');
    expect(get(usersStore.appReadOnly).u1.maintenance).toBe(true);
  });
});

describe('toggleContractor', () => {
  it('flips is_contractor and patches the user list', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'u1', is_contractor: false }]);
    await usersStore.fetchUsers();
    h.setResult({ error: null });
    await usersStore.toggleContractor('u1', false);
    expect(get(usersStore).users.find(u => u.id === 'u1').is_contractor).toBe(true);
  });
});
