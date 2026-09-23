// src/lib/apps/planner/phase3Accessors.test.js
//
// listWorksDue (Building Assets) and listUnaddressedFaults (Compliance, using
// the compliance position's own fault rule). Each rule is a way the Planner
// could hide a fault or a missed completion date.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ tables: {} }));
vi.mock('$lib/utils/api', () => ({
  api: {
    get: vi.fn(async (table, opts) => {
      const rows = h.tables[table] ?? [];
      const f = opts?.filters ?? {};
      return rows.filter((r) => Object.entries(f).every(([k, v]) => r[k] === v));
    }),
    getAll: vi.fn(async (table) => h.tables[table] ?? []),
    getAllIn: vi.fn(async (table, col, ids) => (h.tables[table] ?? []).filter((r) => ids.includes(r[col]))),
  },
}));
vi.mock('$lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://x', PUBLIC_SUPABASE_ANON_KEY: 'k' }));
vi.mock('$lib/apps/compliance/stores/inspectionDefinitionsStore.js', () => ({ inspectionDefinitionsStore: {} }));
vi.mock('$lib/apps/inspection/public.js', () => ({ listWalkSessions: vi.fn(async () => []) }));

import { listWorksDue } from '$lib/apps/building_assets/public.js';
import { listUnaddressedFaults } from '$lib/apps/compliance/public.js';

beforeEach(() => { h.tables = {}; });

describe('listWorksDue', () => {
  it('returns issued schedules with a date up to the window end, overdue included', async () => {
    h.tables.works_schedules = [
      { id: 'late',  status: 'issued',    expected_completion: '2026-01-01' },
      { id: 'soon',  status: 'issued',    expected_completion: '2026-10-01' },
      { id: 'far',   status: 'issued',    expected_completion: '2028-01-01' },
      { id: 'none',  status: 'issued',    expected_completion: null },
      { id: 'draft', status: 'draft',     expected_completion: '2026-10-01' },
      { id: 'done',  status: 'completed', expected_completion: '2026-10-01' },
    ];
    expect((await listWorksDue('2026-12-31')).map((w) => w.id).sort()).toEqual(['late', 'soon']);
  });
});

describe('listUnaddressedFaults', () => {
  const comp = (id, status) => ({ id, status, label: `C-${id}`, asset_id: null });
  const line = (component_id, status) => ({ component_id, schedule: { id: `s-${component_id}`, title: 't', status } });

  // ⛔ A draft has not been sent, so it is not coverage.
  it('keeps a fault that only a DRAFT schedule names', async () => {
    h.tables.components = [comp('a', 'failed')];
    h.tables.works_schedule_items = [line('a', 'draft')];
    expect((await listUnaddressedFaults()).map((f) => f.id)).toEqual(['a']);
  });

  it('drops a fault an ISSUED schedule names', async () => {
    h.tables.components = [comp('a', 'failed'), comp('b', 'problem')];
    h.tables.works_schedule_items = [line('a', 'issued')];
    expect((await listUnaddressedFaults()).map((f) => f.id)).toEqual(['b']);
  });

  it('labels a fault for a person, not by its id', async () => {
    h.tables.components = [comp('a', 'failed')];
    const [f] = await listUnaddressedFaults();
    expect(f.label).toBe('C-a');
  });
});
