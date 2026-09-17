// src/lib/stores/statutoryRegister.js
//
// The periodic activity register, read from `statutory_register`.
//
// R1 of docs/requirements/build_plans/Register_In_The_App_Build_Plan.md.
//
// ── What this is for ────────────────────────────────────────────────────────
// The catalogue used to live only in code, which meant a person who learned a
// new regulation was in force could schedule the WORK and not register the
// DUTY. This is the read path that makes the database the catalogue.
//
// ⛔ THE SEED IS NOT A MIGRATION. `supabase/migrations/` is gitignored, so a
// seed there would never reach a second deployment. The 116 entries stay in
// `statutoryRegisterData.js` — committed, shipping — and are imported from here,
// idempotently on `template_key`. The same call serves first-run seeding and
// importing entries a later release adds.
//
// ⚠ Every path falls back to the seed. Before the import has run, and if the
// table is ever unreachable, the compliance screens show the standard register
// rather than an empty one — because an empty register renders as "no
// requirements", which is the most dangerous thing that screen could say.

import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { supabase } from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';
import { logAudit } from '$lib/utils/auditLogger';
import { STATUTORY_TEMPLATE, setActiveRegister } from '$lib/utils/statutoryTemplate.js';
import { toRow, fromRow } from '$lib/utils/registerRowMapping.js';
import { validateRegisterEntry } from '$lib/utils/registerEntryRules.js';

const logger = getLogger('statutoryRegister');

/**
 * @typedef {{
 *   entries: Object[],
 *   source: 'seed' | 'database',
 *   loading: boolean,
 *   loaded: boolean,
 *   error: string | null
 * }} RegisterState
 */

function createStatutoryRegisterStore() {
  const { subscribe, update } = writable(/** @type {RegisterState} */ ({
    entries: STATUTORY_TEMPLATE,
    provenance: /** @type {Record<string, any>} */ ({}),
    source:  'seed',
    loading: false,
    loaded:  false,
    error:   null,
  }));

  /** Point the pure helpers at whatever we just read, and record which it was. */
  function adopt(entries, source, extra = {}) {
    setActiveRegister(entries);
    update(s => ({ ...s, entries, source, loading: false, ...extra }));
  }

  /**
   * Load the register. Falls back to the seed on an empty table or any error —
   * see the header for why that is not merely defensive.
   */
  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const rows = await api.getAll('statutory_register', { orderBy: 'template_key' });
      if (!rows?.length) {
        logger('table is empty — using the shipped seed');
        adopt(STATUTORY_TEMPLATE, 'seed', { loaded: true });
        return;
      }
      // Provenance is DB-owned, so `fromRow` drops it — but the editor has to
      // show it. Kept beside the entries rather than merged into them, so an
      // entry stays exactly what the seed would produce.
      const provenance = Object.fromEntries(rows.map(r => [r.template_key, {
        origin: r.origin, seedModifiedAt: r.seed_modified_at,
        citationVerifiedBy: r.citation_verified_by,
      }]));
      adopt(rows.map(fromRow), 'database', { loaded: true, provenance });
      logger('✅ loaded', rows.length, 'entries from the database');
    } catch (/** @type {any} */ err) {
      // ⚠ Not fatal, and deliberately so. A compliance screen showing the
      // standard register is right; one showing nothing is a lie.
      logger('⚠ load failed, falling back to the seed:', err.message);
      adopt(STATUTORY_TEMPLATE, 'seed', { loaded: true, error: err.message });
    }
  }

  /**
   * Import the shipped seed into the table. Idempotent on `template_key`:
   * entries already present are left alone, so re-running adds only what is new.
   *
   * ⛔ It does NOT overwrite. A row edited here must survive an import — see
   * the build plan §5. Reporting divergence is R3; this phase only adds.
   *
   * @returns {Promise<{ added: string[], present: number }>}
   */
  async function importSeed() {
    // ⚠ orderBy is REQUIRED on every getAll against this table. `api.getAll`
    // forces a stable order so its pages are consistent, and defaults to 'id' —
    // the house assumption, because every other table has one. This table's
    // identity is `template_key` and there is no surrogate id, so the default
    // fails with "column statutory_register.id does not exist".
    const existing = await api.getAll('statutory_register', {
      select: 'template_key', orderBy: 'template_key',
    });
    const have = new Set((existing ?? []).map(r => r.template_key));
    const missing = STATUTORY_TEMPLATE.filter(e => !have.has(e.key));

    if (missing.length === 0) {
      logger('nothing to import —', have.size, 'entries already present');
      return { added: [], present: have.size };
    }

    const { data: { user } } = await supabase.auth.getUser();
    const rows = missing.map(e => ({
      ...toRow(e),
      origin:     'seed',
      created_by: user?.id ?? null,
    }));

    await api.createMany('statutory_register', rows);
    logAudit('create', 'statutory_register', null, `${rows.length} register entries`, {
      appId: 'admin', eventCategory: 'compliance', severity: 'info',
      afterData: { added: rows.length, from: 'shipped seed' },
    });
    logger('✅ imported', rows.length, 'entries');

    await load();
    return { added: missing.map(e => e.key), present: have.size + missing.length };
  }

  /** The rows the app is showing, keyed — for uniqueness checks and edits. */
  function entryKeys() {
    return new Set(get({ subscribe }).entries.map(e => e.key));
  }

  async function currentUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  /**
   * ⛔ Refuse to write a malformed row. `check:register` guards the seed at
   * build time and does not ship; these are the invariants that do.
   * @param {Object} entry
   * @param {boolean} isNew
   */
  function assertWellFormed(entry, isNew) {
    const problems = validateRegisterEntry(entry, { existingKeys: entryKeys(), isNew });
    if (problems.length) {
      throw new Error(problems.map(p => `${p.field}: ${p.problem}`).join('\n'));
    }
  }

  /**
   * Add a requirement identified HERE.
   *
   * ⛔ `origin: 'local'` and NO citation verification. The row is honestly
   * unverified until someone records one, and must render as such — an entry
   * checked against legislation.gov.uk over fourteen review rounds is not the
   * same object as one typed on a Tuesday, and in one table they look
   * identical unless the provenance says otherwise.
   *
   * @param {Object} entry  a register entry (camelCase)
   */
  async function create(entry) {
    assertWellFormed(entry, true);
    const uid = await currentUserId();
    await api.create('statutory_register', {
      ...toRow(entry),
      origin:     'local',
      created_by: uid,
      updated_by: uid,
      updated_at: new Date().toISOString(),
    }, false);

    logAudit('create', 'statutory_register', entry.key, entry.name, {
      appId: 'admin', eventCategory: 'compliance', severity: 'warning',
      afterData: { origin: 'local', basis: entry.basis, statutory_ref: entry.statutoryRef },
    });
    logger('✅ added local requirement', entry.key);
    await load();
  }

  /**
   * Edit a requirement.
   *
   * ⚠ A SEEDED row that is edited stops claiming to be the standard register's
   * version: `seed_modified_at` is stamped, and a later import must report the
   * divergence rather than overwrite it (R3). Editing is allowed — the
   * alternative is that a user who finds a genuine error in a citation cannot
   * fix it, and this register has shipped genuine errors before.
   *
   * @param {string} key
   * @param {Object} patch  partial entry (camelCase)
   */
  // Named `edit`, not `update`: the store already destructures `update` from
  // writable, and this is an edit of a catalogue ENTRY rather than of state.
  async function edit(key, patch) {
    const current = get({ subscribe }).entries.find(e => e.key === key);
    if (!current) throw new Error(`No register entry ${key}`);

    const merged = { ...current, ...patch, key };
    assertWellFormed(merged, false);

    const uid = await currentUserId();
    /** @type {Record<string, any>} */
    const row = { ...toRow(patch), updated_by: uid, updated_at: new Date().toISOString() };
    delete row.template_key;                      // the identity never moves
    if (wasSeeded(key)) row.seed_modified_at = new Date().toISOString();

    await api.updateMany('statutory_register', { template_key: key }, row, false);
    logAudit('update', 'statutory_register', key, merged.name, {
      appId: 'admin', eventCategory: 'compliance', severity: 'warning',
      afterData: Object.fromEntries(Object.keys(patch).map(k => [k, patch[k]])),
    });
    logger('✅ updated', key);
    await load();
  }

  /**
   * Record that a citation has been checked against its source.
   *
   * ⚠ Deliberately its own act rather than two boxes among thirty-five. The
   * register's shape for a decision someone may later have to justify is
   * reason + name + date, and a verification is one of those.
   *
   * @param {string} key
   * @param {{url: string, on?: string}} evidence
   */
  async function recordCitationVerification(key, evidence) {
    if (!evidence?.url?.trim()) throw new Error('A source URL is required.');
    const uid = await currentUserId();
    await api.updateMany('statutory_register', { template_key: key }, {
      citation_verified_against: evidence.url.trim(),
      citation_verified_on:      evidence.on || new Date().toISOString().slice(0, 10),
      citation_verified_by:      uid,
      updated_by: uid, updated_at: new Date().toISOString(),
    }, false);

    logAudit('update', 'statutory_register', key, 'citation verified', {
      appId: 'admin', eventCategory: 'compliance', severity: 'info',
      afterData: { citation_verified_against: evidence.url },
    });
    await load();
  }

  /** True when the row came from the shipped seed rather than being added here. */
  function wasSeeded(key) {
    return get({ subscribe }).provenance?.[key]?.origin === 'seed';
  }

  /** What a caller needs to know without subscribing. */
  function usingSeed() {
    return get({ subscribe }).source === 'seed';
  }

  return {
    subscribe, load, importSeed, usingSeed,
    create, edit, recordCitationVerification,
  };
}

export const statutoryRegister = createStatutoryRegisterStore();
