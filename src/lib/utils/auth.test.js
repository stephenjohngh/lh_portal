// src/lib/utils/auth.test.js
// Permission helpers that read profiles via Supabase. Mock the one seam
// (supabaseClient) and pin the decision logic: admins always win, read-only
// blocks modification, errors fail closed (deny).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let profile = { data: null, error: null };
  const builder = {
    select: vi.fn(() => builder),
    eq:     vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(profile)),
  };
  return {
    builder,
    supabase: { from: vi.fn(() => builder), auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) } },
    setProfile: (p) => { profile = p; },
  };
});

vi.mock('$lib/supabaseClient', () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/logger',   () => ({ getLogger: () => () => {} }));

const { isAdmin, isReadOnly, canModify, getPermissionLevel, canPerformAction } = await import('./auth.js');

beforeEach(() => { vi.clearAllMocks(); h.setProfile({ data: null, error: null }); });

describe('isAdmin', () => {
  it('is true only when the profile flag is set', async () => {
    h.setProfile({ data: { is_admin: true }, error: null });
    expect(await isAdmin('u1')).toBe(true);
    h.setProfile({ data: { is_admin: false }, error: null });
    expect(await isAdmin('u1')).toBe(false);
  });
  it('returns false for a missing userId or a query error', async () => {
    expect(await isAdmin(null)).toBe(false);
    h.setProfile({ data: null, error: { message: 'boom' } });
    expect(await isAdmin('u1')).toBe(false);
  });
});

describe('isReadOnly', () => {
  it('admins are never read-only', async () => {
    h.setProfile({ data: { is_admin: true, is_read_only: true }, error: null });
    expect(await isReadOnly('u1')).toBe(false);
  });
  it('a non-admin read-only user is read-only', async () => {
    h.setProfile({ data: { is_admin: false, is_read_only: true }, error: null });
    expect(await isReadOnly('u1')).toBe(true);
  });
});

describe('canModify', () => {
  it('admins can always modify', async () => {
    h.setProfile({ data: { is_admin: true, is_read_only: true }, error: null });
    expect(await canModify('u1')).toBe(true);
  });
  it('non-admin read-only users cannot modify', async () => {
    h.setProfile({ data: { is_admin: false, is_read_only: true }, error: null });
    expect(await canModify('u1')).toBe(false);
  });
  it('read-write users can modify', async () => {
    h.setProfile({ data: { is_admin: false, is_read_only: false }, error: null });
    expect(await canModify('u1')).toBe(true);
  });
});

describe('getPermissionLevel', () => {
  it('maps the flags to a level, defaulting to read-only on error', async () => {
    h.setProfile({ data: { is_admin: true }, error: null });
    expect(await getPermissionLevel('u1')).toBe('admin');
    h.setProfile({ data: { is_admin: false, is_read_only: true }, error: null });
    expect(await getPermissionLevel('u1')).toBe('read-only');
    h.setProfile({ data: { is_admin: false, is_read_only: false }, error: null });
    expect(await getPermissionLevel('u1')).toBe('read-write');
    h.setProfile({ data: null, error: { message: 'x' } });
    expect(await getPermissionLevel('u1')).toBe('read-only');
  });
});

describe('canPerformAction', () => {
  it('admins can do anything', async () => {
    h.setProfile({ data: { is_admin: true }, error: null });
    expect(await canPerformAction('delete_issue', null, 'u1')).toBe(true);
  });
  it('read-only users can only do view-style actions', async () => {
    h.setProfile({ data: { is_admin: false, is_read_only: true }, error: null });
    expect(await canPerformAction('view_issue', null, 'u1')).toBe(true);
    expect(await canPerformAction('edit_issue', null, 'u1')).toBe(false);
  });
  it('read-write users can edit only resources they own', async () => {
    h.setProfile({ data: { is_admin: false, is_read_only: false }, error: null });
    expect(await canPerformAction('edit_issue', { created_by: 'u1' }, 'u1')).toBe(true);
    expect(await canPerformAction('edit_issue', { created_by: 'other' }, 'u1')).toBe(false);
    expect(await canPerformAction('create_issue', null, 'u1')).toBe(true);
  });
});
