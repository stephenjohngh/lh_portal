// src/lib/stores/portalSettings.test.js
// Global portal config (topbar app list + display order). Pins: load parses the
// two keyed rows (and degrades to all/default on error); save/saveOrder upsert
// the right key and patch state immediately. Seam mocked: supabaseClient.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  let result = { data: [], error: null };
  const makeBuilder = () => {
    const b = {};
    const chain = () => b;
    for (const m of ['select', 'in', 'upsert']) b[m] = vi.fn(chain);
    b.then = (res, rej) => Promise.resolve(result).then(res, rej);
    return b;
  };
  const supabase = {
    from: vi.fn(() => makeBuilder()),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) },
  };
  return { supabase, setResult: (r) => { result = r; } };
});

vi.mock('$lib/supabaseClient', () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/logger',   () => ({ getLogger: () => () => {} }));

const { portalSettings } = await import('./portalSettings.js');

beforeEach(() => { vi.clearAllMocks(); h.setResult({ data: [], error: null }); });

describe('load', () => {
  it('parses the topbar_apps and app_order rows', async () => {
    h.setResult({ data: [
      { key: 'topbar_apps', value: ['issues', 'mor'] },
      { key: 'app_order',   value: ['mor', 'issues'] },
    ], error: null });
    await portalSettings.load();
    const s = get(portalSettings);
    expect(s.loaded).toBe(true);
    expect(s.ids).toEqual(['issues', 'mor']);
    expect(s.order).toEqual(['mor', 'issues']);
  });

  it('defaults to null (show all / default order) when rows are missing', async () => {
    h.setResult({ data: [], error: null });
    await portalSettings.load();
    expect(get(portalSettings)).toMatchObject({ loaded: true, ids: null, order: null });
  });

  it('degrades gracefully to all/default on a query error', async () => {
    h.setResult({ data: null, error: new Error('rls') });
    await portalSettings.load();
    expect(get(portalSettings)).toMatchObject({ loaded: true, ids: null, order: null });
  });
});

describe('save / saveOrder', () => {
  it('upserts the topbar key and updates state immediately', async () => {
    h.setResult({ error: null });
    await portalSettings.save(['issues', 'admin']);
    const b = h.supabase.from.mock.results[0].value;
    expect(b.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'topbar_apps', value: ['issues', 'admin'], updated_by: 'u1' }),
      { onConflict: 'key' },
    );
    expect(get(portalSettings).ids).toEqual(['issues', 'admin']);
  });

  it('upserts the order key and updates state immediately', async () => {
    h.setResult({ error: null });
    await portalSettings.saveOrder(['admin', 'issues']);
    const b = h.supabase.from.mock.results[0].value;
    expect(b.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'app_order', value: ['admin', 'issues'] }),
      { onConflict: 'key' },
    );
    expect(get(portalSettings).order).toEqual(['admin', 'issues']);
  });

  it('throws on an upsert error', async () => {
    h.setResult({ error: { message: 'denied' } });
    await expect(portalSettings.save(['x'])).rejects.toThrow('denied');
  });
});
