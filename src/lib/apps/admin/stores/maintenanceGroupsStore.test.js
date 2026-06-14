// src/lib/apps/admin/stores/maintenanceGroupsStore.test.js
// CHARACTERIZATION tests for maintenanceGroupsStore (Admin > Maint. Groups /
// 10-Yr Plan). Seams mocked: api, supabaseClient (auth.getUser), logger.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  const api = {
    get:    vi.fn(() => Promise.resolve([])),
    create: vi.fn((t, d) => Promise.resolve({ id: 'g-new', ...d })),
    update: vi.fn((t, id, d) => Promise.resolve({ id, ...d })),
    delete: vi.fn(() => Promise.resolve()),
  };
  const supabase = { auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) } };
  return { api, supabase };
});

vi.mock('$lib/utils/api',      () => ({ api: h.api }));
vi.mock('$lib/supabaseClient', () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/logger',   () => ({ getLogger: () => () => {} }));

const { maintenanceGroupsStore: groups } = await import('./maintenanceGroupsStore.js');

beforeEach(() => { vi.clearAllMocks(); h.api.get.mockResolvedValue([]); });

describe('load', () => {
  it('loads groups ordered by name and clears loading', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'g1', name: 'Boilers' }]);
    await groups.load();
    expect(get(groups).groups).toHaveLength(1);
    expect(get(groups).loading).toBe(false);
    expect(h.api.get).toHaveBeenCalledWith('maintenance_groups', { orderBy: 'name' });
  });

  it('records the error and rethrows on failure', async () => {
    h.api.get.mockRejectedValueOnce(new Error('boom'));
    await expect(groups.load()).rejects.toThrow('boom');
    expect(get(groups).error).toBe('boom');
  });
});

describe('create', () => {
  it('trims the name, defaults the array fields, stamps the user, inserts sorted', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'g1', name: 'Zebra' }]);
    await groups.load();
    h.api.create.mockResolvedValueOnce({ id: 'g2', name: 'Alpha' });
    await groups.create({ name: '  Alpha  ' });
    const arg = h.api.create.mock.calls[0][1];
    expect(arg).toMatchObject({ name: 'Alpha', system_ids: [], type_codes: [], space_ids: [], created_by: 'u1' });
    expect(get(groups).groups.map(g => g.name)).toEqual(['Alpha', 'Zebra']);  // sorted
  });
});

describe('save / savePlan', () => {
  it('save patches the full group and re-sorts', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'g1', name: 'Old' }]);
    await groups.load();
    await groups.save('g1', { name: 'New' });
    expect(h.api.update).toHaveBeenCalledWith('maintenance_groups', 'g1', expect.objectContaining({ name: 'New', updated_by: 'u1' }));
    expect(get(groups).groups[0].name).toBe('New');
  });

  it('savePlan writes ONLY the planning fields (not name/system_ids)', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'g1', name: 'Keep' }]);
    await groups.load();
    await groups.savePlan('g1', { last_renewal_date: '2026-01-01', lifetime_years: 10, expected_cost: 5000, notes: ' n ' });
    const patch = h.api.update.mock.calls[0][2];
    expect(patch).toMatchObject({ last_renewal_date: '2026-01-01', lifetime_years: 10, expected_cost: 5000, notes: 'n', updated_by: 'u1' });
    expect(patch).not.toHaveProperty('name');
    expect(patch).not.toHaveProperty('system_ids');
  });
});

describe('remove', () => {
  it('deletes the group and removes it from state', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'g1', name: 'X' }]);
    await groups.load();
    await groups.remove('g1');
    expect(h.api.delete).toHaveBeenCalledWith('maintenance_groups', 'g1');
    expect(get(groups).groups).toHaveLength(0);
  });
});
