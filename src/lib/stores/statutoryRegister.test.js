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
  getAll: vi.fn(), createMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(),
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  logAudit: vi.fn(),
}));

vi.mock('$lib/utils/api', () => ({ api: {
  getAll: h.getAll, createMany: h.createMany, create: h.create, updateMany: h.updateMany,
} }));
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

describe('R2 — writing to the register', () => {
  /** Load the store from a fake table so `update` has something to patch. */
  const loadWith = async (rows) => {
    h.getAll.mockResolvedValue(rows);
    await statutoryRegister.load();
  };
  const seedRow = (i = 0, over = {}) => asRow(STATUTORY_TEMPLATE[i], over);

  describe('create', () => {
    it('⛔ marks it LOCAL and records no verification', async () => {
      // An entry checked against legislation.gov.uk over fourteen review rounds
      // is not the same object as one typed on a Tuesday, and in one table they
      // look identical unless the provenance says otherwise.
      await loadWith([seedRow(0)]);
      await statutoryRegister.create({
        key: 'new_thing', name: 'A new duty', description: 'What it involves.',
        group: 'fire_safety', basis: 'statute', statutoryRef: 'Some Act 2027 s.1',
        appliesWhen: 'Always', evidencedBy: 'maintenance_job', frequencyDays: 365,
      });

      const [table, row] = h.create.mock.calls[0];
      expect(table).toBe('statutory_register');
      expect(row.origin).toBe('local');
      expect(row.citation_verified_against).toBeUndefined();
      expect(row.citation_verified_on).toBeUndefined();
      expect(row.template_key).toBe('new_thing');
    });

    it('⛔ REFUSES a malformed row rather than storing it', async () => {
      // check:register guards the seed at build time and does not ship. These
      // are the invariants that do.
      await loadWith([seedRow(0)]);
      await expect(statutoryRegister.create({
        key: 'no_citation', name: 'Nameless duty', description: 'x',
        group: 'fire_safety', basis: 'statute', statutoryRef: '', appliesWhen: 'Always',
      })).rejects.toThrow(/statutoryRef/);
      expect(h.create).not.toHaveBeenCalled();
    });

    it('refuses a key already in the register', async () => {
      await loadWith([seedRow(0)]);
      await expect(statutoryRegister.create({
        key: STATUTORY_TEMPLATE[0].key, name: 'Clash', description: 'x',
        group: 'fire_safety', basis: 'statute', statutoryRef: 'y',
        appliesWhen: 'Always', evidencedBy: null,
      })).rejects.toThrow(/key/);
    });

    it('audits it as a compliance change, not a routine one', async () => {
      await loadWith([seedRow(0)]);
      await statutoryRegister.create({
        key: 'audited_thing', name: 'X', description: 'y',
        group: 'governance', basis: 'management', statutoryRef: 'z',
        appliesWhen: 'Always', evidencedBy: null,
      });
      const [, , , , opts] = h.logAudit.mock.calls.at(-1);
      expect(opts.severity).toBe('warning');
      expect(opts.eventCategory).toBe('compliance');
    });
  });

  describe('update', () => {
    it('⚠ stamps seed_modified_at when a SEEDED row is edited', async () => {
      // It stops claiming to be the standard register's version, and a later
      // import must report the divergence rather than overwrite it.
      await loadWith([seedRow(0, { origin: 'seed' })]);
      await statutoryRegister.edit(STATUTORY_TEMPLATE[0].key, { name: 'Corrected name' });

      const [table, filters, row] = h.updateMany.mock.calls[0];
      expect(table).toBe('statutory_register');
      expect(filters).toEqual({ template_key: STATUTORY_TEMPLATE[0].key });
      expect(row.seed_modified_at).toBeTruthy();
      expect(row.name).toBe('Corrected name');
    });

    it('does NOT stamp seed_modified_at on a locally-added row', async () => {
      await loadWith([seedRow(0, { origin: 'local' })]);
      await statutoryRegister.edit(STATUTORY_TEMPLATE[0].key, { name: 'Edited' });
      expect(h.updateMany.mock.calls[0][2].seed_modified_at).toBeUndefined();
    });

    it('⛔ never moves the identity', async () => {
      // template_key is what statutory_obligations and statutory_exclusions
      // link on; changing it would orphan both.
      await loadWith([seedRow(0)]);
      await statutoryRegister.edit(STATUTORY_TEMPLATE[0].key, { name: 'Y', key: 'something_else' });
      expect(h.updateMany.mock.calls[0][2].template_key).toBeUndefined();
    });

    it('validates the MERGED row, not just the patch', async () => {
      // A patch that is fine alone can still make the row malformed.
      await loadWith([seedRow(0)]);
      await expect(statutoryRegister.edit(STATUTORY_TEMPLATE[0].key, { statutoryRef: '   ' }))
        .rejects.toThrow(/statutoryRef/);
      expect(h.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('recordCitationVerification', () => {
    it('records the source, the date AND the person', async () => {
      // The register's shape for a decision someone may later have to justify
      // is reason + name + date. A verification is one of those.
      await loadWith([seedRow(0)]);
      await statutoryRegister.recordCitationVerification(STATUTORY_TEMPLATE[0].key, {
        url: 'https://www.legislation.gov.uk/uksi/2022/547/regulation/10',
      });

      const [, filters, row] = h.updateMany.mock.calls[0];
      expect(filters.template_key).toBe(STATUTORY_TEMPLATE[0].key);
      expect(row.citation_verified_against).toContain('legislation.gov.uk');
      expect(row.citation_verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.citation_verified_by).toBe('u1');
    });

    it('refuses a verification with no source', async () => {
      // "Verified" with nothing to re-check against is not a verification.
      await loadWith([seedRow(0)]);
      await expect(statutoryRegister.recordCitationVerification(STATUTORY_TEMPLATE[0].key, { url: '  ' }))
        .rejects.toThrow(/source/i);
      expect(h.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('provenance', () => {
    it('is kept BESIDE the entries, never merged into them', async () => {
      // An entry must stay exactly what the seed would produce, or the
      // round-trip guarantee stops meaning anything.
      await loadWith([seedRow(0, { origin: 'local', seed_modified_at: null })]);
      const s = get(statutoryRegister);
      expect(s.provenance[STATUTORY_TEMPLATE[0].key].origin).toBe('local');
      expect('origin' in s.entries[0]).toBe(false);
    });
  });
});

describe('R3 — import as a diff', () => {
  const loadWith = async (rows) => { h.getAll.mockResolvedValue(rows); await statutoryRegister.load(); };

  it('reports nothing to do when the table matches the seed', async () => {
    await loadWith(STATUTORY_TEMPLATE.map(e => asRow(e)));
    const d = statutoryRegister.previewImport();
    expect(d.hasAnything).toBe(false);
    expect(d.unchanged).toHaveLength(STATUTORY_TEMPLATE.length);
  });

  it('⛔ preview CHANGES NOTHING', async () => {
    await loadWith([asRow(STATUTORY_TEMPLATE[0])]);
    statutoryRegister.previewImport();
    expect(h.createMany).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('separates the seed having moved from somebody having edited here', async () => {
    // The only thing that distinguishes them is seed_modified_at, because we do
    // not hold the seed as it was at import time.
    await loadWith([
      asRow(STATUTORY_TEMPLATE[0], { statutory_ref: 'changed in the database', seed_modified_at: null }),
      asRow(STATUTORY_TEMPLATE[1], { statutory_ref: 'changed in the database', seed_modified_at: '2026-09-17T10:00:00Z' }),
    ]);
    const d = statutoryRegister.previewImport();
    expect(d.updatable.map(r => r.key)).toEqual([STATUTORY_TEMPLATE[0].key]);
    expect(d.divergent.map(r => r.key)).toEqual([STATUTORY_TEMPLATE[1].key]);
  });

  describe('applyFromSeed', () => {
    it('does nothing at all when nothing is named', async () => {
      await loadWith([asRow(STATUTORY_TEMPLATE[0])]);
      const r = await statutoryRegister.applyFromSeed({});
      expect(r).toEqual({ added: 0, updated: 0 });
      expect(h.createMany).not.toHaveBeenCalled();
      expect(h.updateMany).not.toHaveBeenCalled();
    });

    it('⛔ acts ONLY on keys named explicitly', async () => {
      // So a divergent row cannot be swept along by an "update all" over a list
      // that happened to include it.
      await loadWith([asRow(STATUTORY_TEMPLATE[0], { statutory_ref: 'x' }), asRow(STATUTORY_TEMPLATE[1], { statutory_ref: 'y' })]);
      await statutoryRegister.applyFromSeed({ update: [STATUTORY_TEMPLATE[0].key] });

      expect(h.updateMany).toHaveBeenCalledTimes(1);
      expect(h.updateMany.mock.calls[0][1]).toEqual({ template_key: STATUTORY_TEMPLATE[0].key });
    });

    it('⚠ clears the edited-here mark when the standard version is taken', async () => {
      // The row matches the standard register again, so it must stop claiming a
      // divergence that no longer exists.
      await loadWith([asRow(STATUTORY_TEMPLATE[0], { statutory_ref: 'x', seed_modified_at: '2026-09-17T10:00:00Z' })]);
      await statutoryRegister.applyFromSeed({ update: [STATUTORY_TEMPLATE[0].key] });
      expect(h.updateMany.mock.calls[0][2].seed_modified_at).toBeNull();
    });

    it('⛔ never moves the identity when updating', async () => {
      await loadWith([asRow(STATUTORY_TEMPLATE[0], { statutory_ref: 'x' })]);
      await statutoryRegister.applyFromSeed({ update: [STATUTORY_TEMPLATE[0].key] });
      expect(h.updateMany.mock.calls[0][2].template_key).toBeUndefined();
    });

    it('adds named new entries as seeded, not local', async () => {
      await loadWith([asRow(STATUTORY_TEMPLATE[0])]);
      await statutoryRegister.applyFromSeed({ add: [STATUTORY_TEMPLATE[1].key] });
      const [, rows] = h.createMany.mock.calls[0];
      expect(rows).toHaveLength(1);
      expect(rows[0].template_key).toBe(STATUTORY_TEMPLATE[1].key);
      expect(rows[0].origin).toBe('seed');
    });

    it('ignores a key the seed does not carry', async () => {
      await loadWith([asRow(STATUTORY_TEMPLATE[0])]);
      const r = await statutoryRegister.applyFromSeed({ add: ['not_in_the_seed'] });
      expect(r.added).toBe(0);
      expect(h.createMany).not.toHaveBeenCalled();
    });

    it('audits it as a compliance change', async () => {
      await loadWith([asRow(STATUTORY_TEMPLATE[0])]);
      await statutoryRegister.applyFromSeed({ add: [STATUTORY_TEMPLATE[1].key] });
      const [, , , , opts] = h.logAudit.mock.calls.at(-1);
      expect(opts.severity).toBe('warning');
    });
  });
});
