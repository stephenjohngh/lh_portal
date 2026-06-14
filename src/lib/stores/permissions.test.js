// src/lib/stores/permissions.test.js
// CHARACTERIZATION tests for the permissions store. Pins the canModify logic:
// admin always can; profile-level read-only always blocks; otherwise it's the
// per-app grant + per-app read-only flag. Seam mocked: supabaseClient (a
// builder whose .single() yields the profile and whose .eq() terminal yields
// the app_permissions rows).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  let profile = { data: { is_admin: false, is_read_only: false }, error: null };
  let perms   = { data: [], error: null };
  const makeBuilder = () => {
    const b = {};
    const chain = () => b;
    for (const m of ['select', 'eq']) b[m] = vi.fn(chain);
    b.single = vi.fn(() => Promise.resolve(profile));
    b.then = (res, rej) => Promise.resolve(perms).then(res, rej);
    return b;
  };
  const supabase = { from: vi.fn(() => makeBuilder()) };
  return { supabase, setProfile: (p) => { profile = p; }, setPerms: (p) => { perms = p; } };
});

vi.mock('$lib/supabaseClient', () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/logger',   () => ({ getLogger: () => () => {} }));

const { permissions } = await import('./permissions.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.setProfile({ data: { is_admin: false, is_read_only: false }, error: null });
  h.setPerms({ data: [], error: null });
});

describe('init', () => {
  it('with no userId resets to a locked-out, loaded state', async () => {
    await permissions.init(null);
    expect(get(permissions)).toMatchObject({ loading: false, isAdmin: false, canModify: false, userId: null });
  });

  it('an admin can modify regardless of app permissions', async () => {
    h.setProfile({ data: { is_admin: true, is_read_only: false }, error: null });
    await permissions.init('u1', 'issues');
    const s = get(permissions);
    expect(s.isAdmin).toBe(true);
    expect(s.canModify).toBe(true);
  });

  it('a profile-level read-only user cannot modify even with an app grant', async () => {
    h.setProfile({ data: { is_admin: false, is_read_only: true }, error: null });
    h.setPerms({ data: [{ app_id: 'issues', is_read_only: false }], error: null });
    await permissions.init('u1', 'issues');
    const s = get(permissions);
    expect(s.isReadOnly).toBe(true);
    expect(s.canModify).toBe(false);
  });

  it('an editor with a read-write grant for the current app can modify', async () => {
    h.setPerms({ data: [{ app_id: 'issues', is_read_only: false }], error: null });
    await permissions.init('u1', 'issues');
    expect(get(permissions).canModify).toBe(true);
  });

  it('an editor with only a read-only grant for the current app cannot modify', async () => {
    h.setPerms({ data: [{ app_id: 'issues', is_read_only: true }], error: null });
    await permissions.init('u1', 'issues');
    expect(get(permissions).canModify).toBe(false);
  });

  it('falls back to a safe locked-out state when the profile query errors', async () => {
    h.setProfile({ data: null, error: new Error('rls') });
    await permissions.init('u1', 'issues');
    expect(get(permissions)).toMatchObject({ loading: false, isAdmin: false, canModify: false });
  });
});

describe('canModifyApp / hasAppAccess', () => {
  beforeEach(async () => {
    h.setPerms({ data: [
      { app_id: 'issues',      is_read_only: false },
      { app_id: 'maintenance', is_read_only: true  },
    ], error: null });
    await permissions.init('u1', 'issues');
  });

  it('canModifyApp reflects the per-app read-only flag', () => {
    expect(permissions.canModifyApp('issues')).toBe(true);
    expect(permissions.canModifyApp('maintenance')).toBeFalsy();  // granted but read-only
    expect(permissions.canModifyApp('admin')).toBeFalsy();        // no grant
  });

  it('hasAppAccess is true for any granted app', () => {
    expect(permissions.hasAppAccess('maintenance')).toBe(true);
    expect(permissions.hasAppAccess('admin')).toBe(false);
  });
});

describe('clear', () => {
  it('resets to a logged-out state', async () => {
    h.setProfile({ data: { is_admin: true }, error: null });
    await permissions.init('u1');
    permissions.clear();
    expect(get(permissions)).toMatchObject({ isAdmin: false, canModify: false, userId: null });
  });
});
