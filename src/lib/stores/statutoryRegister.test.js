// src/lib/stores/statutoryRegister.test.js
//
// Store-contract test. What has to hold in R1:
//
//   1. ⛔ every path falls back to the shipped seed, because an empty register
//      renders as "no requirements" — the most dangerous thing that screen
//      could say;
//   2. the import is idempotent on template_key and never overwrites;
//   3. loading the table re-points the PURE helpers too, or the panel would
//      show the database while the compliance report computed from the seed.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({
  getAll: vi.fn(), createMany: vi.fn(),
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  logAudit: vi.fn(),
}));

vi.mock('$lib/utils/api', () => ({ api: { getAll: h.getAll, createMany: h.createMany } }));
vi.mock('$lib/supabaseClient', () => ({ supabase: { auth: { getUser: h.getUser } } }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
// ⚠ logger touches localStorage at module load, so it is one of the seams
// CLAUDE.md lists for a store-contract test — along with api, supabaseClient
// and anything that transitively pulls $env / $app.
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://x' }));
vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false }));

const { statutoryRegister } = await import('./statutoryRegister.js');
const { STATUTORY_TEMPLATE, activeRegister, isUsingSeed, templateEntry, setActiveRegister } =
  await import('$lib/utils/statutoryTemplate.js');

/** A database row for one seed entry, with the columns the DB owns. */
const asRow = (entry, over = {}) => {
  const row = {};
  for (const [k, v] of Object.entries(entry)) {
    row[k === 'key' ? 'template_key' : k === 'group' ? 'group_key'
      : k === 'trigger' ? 'trigger_event'
      : k.replace(/[A-Z]/g, c => '_' + c.toLowerCase())] = v;
  }
  return { ...row, origin: 'seed', active: true, created_at: 'x', ...over };
};

beforeEach(() => {
  vi.clearAllMocks();
  setActiveRegister(null);          // back to the seed between tests
});

describe('load — and the fallback that is not merely defensive', () => {
  it('starts on the seed before anything is loaded', () => {
    expect(get(statutoryRegister).source).toBe('seed');
    expect(isUsingSeed()).toBe(true);
  });

  it('adopts the database when the table has rows', async () => {
    h.getAll.mockResolvedValue([asRow(STATUTORY_TEMPLATE[0]), asRow(STATUTORY_TEMPLATE[1])]);
    await statutoryRegister.load();

    const s = get(statutoryRegister);
    expect(s.source).toBe('database');
    expect(s.entries).toHaveLength(2);
    expect(s.entries[0].key).toBe(STATUTORY_TEMPLATE[0].key);
  });

  it('⛔ falls back to the seed on an EMPTY table, never to nothing', () => {
    h.getAll.mockResolvedValue([]);
    return statutoryRegister.load().then(() => {
      const s = get(statutoryRegister);
      expect(s.source).toBe('seed');
      expect(s.entries).toHaveLength(STATUTORY_TEMPLATE.length);
      expect(s.loaded).toBe(true);
    });
  });

  it('⛔ falls back to the seed on an ERROR, and is not fatal', async () => {
    h.getAll.mockRejectedValue(new Error('network'));
    await statutoryRegister.load();

    const s = get(statutoryRegister);
    expect(s.source).toBe('seed');
    expect(s.entries).toHaveLength(STATUTORY_TEMPLATE.length);
    expect(s.error).toBe('network');        // recorded, not thrown
  });

  it('re-points the PURE helpers, not just the store', async () => {
    // Otherwise the panel renders the database while the compliance report
    // computes from the seed, and the two disagree silently.
    const one = asRow(STATUTORY_TEMPLATE[0], { name: 'Renamed in the database' });
    h.getAll.mockResolvedValue([one]);
    await statutoryRegister.load();

    expect(activeRegister()).toHaveLength(1);
    expect(isUsingSeed()).toBe(false);
    expect(templateEntry(STATUTORY_TEMPLATE[0].key).name).toBe('Renamed in the database');
  });
});

describe('⚠ every read names its order', () => {
  it('⛔ never lets api.getAll fall back to ordering by id', async () => {
    // The mock in this file returns whatever it is told, so it cannot exercise
    // api.getAll's own default — which is `orderBy: 'id'`, because every other
    // table in the portal has one. This table is keyed on template_key and has
    // no surrogate id, so the default fails outright at the database.
    //
    // ⭐ A store-contract test that mocks `api` cannot catch an api-level
    // assumption. This asserts the call shape instead, which it can.
    h.getAll.mockResolvedValue([]);
    await statutoryRegister.load();
    await statutoryRegister.importSeed();

    expect(h.getAll.mock.calls.length).toBeGreaterThan(0);
    for (const [table, opts] of h.getAll.mock.calls) {
      expect(table).toBe('statutory_register');
      expect(opts?.orderBy, 'getAll must name its order for this table').toBeTruthy();
    }
  });
});

describe('importSeed', () => {
  it('inserts every entry into an empty table', async () => {
    h.getAll.mockResolvedValueOnce([]).mockResolvedValue([]);
    const report = await statutoryRegister.importSeed();

    expect(report.added).toHaveLength(STATUTORY_TEMPLATE.length);
    expect(h.createMany).toHaveBeenCalledOnce();
    const [table, rows] = h.createMany.mock.calls[0];
    expect(table).toBe('statutory_register');
    expect(rows[0].template_key).toBeTruthy();
    expect(rows[0].origin).toBe('seed');
    expect(rows[0].created_by).toBe('u1');
  });

  it('is idempotent — a second run adds nothing', async () => {
    h.getAll.mockResolvedValue(STATUTORY_TEMPLATE.map(e => ({ template_key: e.key })));
    const report = await statutoryRegister.importSeed();

    expect(report.added).toEqual([]);
    expect(report.present).toBe(STATUTORY_TEMPLATE.length);
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it('adds only what is missing, and ⛔ never overwrites what is there', async () => {
    // A row edited in the app must survive an import. Reporting divergence is
    // R3; this phase must at minimum not clobber.
    const present = STATUTORY_TEMPLATE.slice(0, 100).map(e => ({ template_key: e.key }));
    h.getAll.mockResolvedValueOnce(present).mockResolvedValue([]);

    const report = await statutoryRegister.importSeed();

    expect(report.added).toHaveLength(STATUTORY_TEMPLATE.length - 100);
    const [, rows] = h.createMany.mock.calls[0];
    const sent = new Set(rows.map(r => r.template_key));
    for (const e of STATUTORY_TEMPLATE.slice(0, 100)) {
      expect(sent.has(e.key), `${e.key} must not be re-sent`).toBe(false);
    }
  });

  it('audits the import', async () => {
    h.getAll.mockResolvedValueOnce([]).mockResolvedValue([]);
    await statutoryRegister.importSeed();
    expect(h.logAudit).toHaveBeenCalled();
  });
});
