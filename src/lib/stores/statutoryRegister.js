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
      adopt(rows.map(fromRow), 'database', { loaded: true });
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

  /** What a caller needs to know without subscribing. */
  function usingSeed() {
    return get({ subscribe }).source === 'seed';
  }

  return { subscribe, load, importSeed, usingSeed };
}

export const statutoryRegister = createStatutoryRegisterStore();
