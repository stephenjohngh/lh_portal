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
    for (const m of ['select', 'in', 'upsert', 'order', 'limit', 'eq', 'update']) b[m] = vi.fn(chain);
    b.then = (res, rej) => Promise.resolve(result).then(res, rej);
    // The building row (Admin → Building & business) is read alongside.
    b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    return b;
  };
  const supabase = {
    from: vi.fn(() => makeBuilder()),
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1' } } } })) },
  };
  return { supabase, setResult: (r) => { result = r; } };
});

vi.mock('#lib/supabaseClient.js', () => ({ supabase: h.supabase }));
vi.mock('#lib/utils/logger.js',   () => ({ getLogger: () => () => {} }));

const { portalSettings } = await import('./portalSettings.js');
const { dueSoonDays, setDueWindows, DUE_SOON_DEFAULTS } = await import('#lib/utils/dueWindows.js');

beforeEach(() => { vi.clearAllMocks(); h.setResult({ data: [], error: null }); setDueWindows(null); });

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

// The "due soon" windows (Admin → Due windows) ride in the same table and the
// same query. What loads is put in force for every app at once.
describe('due windows', () => {
  it('reads due_soon_days in the same query and puts it in force', async () => {
    h.setResult({ data: [{ key: 'due_soon_days', value: { maintenanceJob: 45 } }], error: null });
    await portalSettings.load();
    const b = h.supabase.from.mock.results[0].value;
    expect(b.in).toHaveBeenCalledWith('key', expect.arrayContaining(['due_soon_days']));
    expect(dueSoonDays('maintenanceJob')).toBe(45);
    expect(get(portalSettings).dueWindows).toEqual({ maintenanceJob: 45 });
    expect(get(portalSettings).windows.maintenanceJob).toBe(45);
    expect(get(portalSettings).windows.certificateExpiry).toBe(DUE_SOON_DEFAULTS.certificateExpiry);
  });

  it('puts the defaults back when nothing is saved', async () => {
    setDueWindows({ maintenanceJob: 45 });
    await portalSettings.load();
    expect(dueSoonDays('maintenanceJob')).toBe(DUE_SOON_DEFAULTS.maintenanceJob);
  });

  it('keeps the windows in force when a re-read fails, rather than dropping an admin’s settings', async () => {
    h.setResult({ data: [{ key: 'due_soon_days', value: { maintenanceJob: 45 } }], error: null });
    await portalSettings.load();
    h.setResult({ data: null, error: new Error('network') });
    await portalSettings.load();
    expect(dueSoonDays('maintenanceJob')).toBe(45);
    expect(get(portalSettings).loaded).toBe(true);
  });

  it('stores only the windows that differ from the default, and puts them in force', async () => {
    h.setResult({ error: null });
    const stored = await portalSettings.saveDueWindows({
      ...DUE_SOON_DEFAULTS, maintenanceJob: 21, plannerArranging: 90, nonsense: 5,
    });
    expect(stored).toEqual({ maintenanceJob: 21, plannerArranging: 90 });
    const b = h.supabase.from.mock.results[0].value;
    expect(b.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'due_soon_days', value: { maintenanceJob: 21, plannerArranging: 90 }, updated_by: 'u1' }),
      { onConflict: 'key' },
    );
    expect(dueSoonDays('plannerArranging')).toBe(90);
    expect(get(portalSettings).dueWindows).toEqual({ maintenanceJob: 21, plannerArranging: 90 });
  });

  it('changes nothing in force when the save is refused', async () => {
    h.setResult({ error: { message: 'denied' } });
    await expect(portalSettings.saveDueWindows({ maintenanceJob: 21 })).rejects.toThrow('denied');
    expect(dueSoonDays('maintenanceJob')).toBe(DUE_SOON_DEFAULTS.maintenanceJob);
  });
});
