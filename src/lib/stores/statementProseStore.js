// src/lib/stores/statementProseStore.js
//
// The prose of the obligations statement, read from `statement_prose`.
//
// R5 of docs/requirements/build_plans/Register_In_The_App_Build_Plan.md.
//
// ⚠ EVERY PATH FALLS BACK TO THE SHIPPED PROSE, and it is load-bearing rather
// than defensive — the same argument as `statutoryRegister`. Before the import
// has run, and if the table is ever unreachable, the statement is still
// produced from the text that ships. A document that silently lost §1–§5 would
// be a register with no explanation of what it is, sent to an outside reviewer.
//
// ⛔ BUT THE DOCUMENT MUST SAY WHICH IT USED. Falling back is right; doing so
// without saying so is not, because the shipped prose describes a standard
// higher-risk building and the stored prose describes THIS one. `source` is
// carried through to the export, which prints it.

import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { supabase } from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';
import { logAudit } from '$lib/utils/auditLogger';
import { STATEMENT_PROSE } from '$lib/utils/statementProse.js';
import { normaliseMarkdown } from '$lib/utils/statementProseParse.js';
import { diffProse } from '$lib/utils/proseDiff.js';

const logger = getLogger('statementProse');

/**
 * @typedef {import('$lib/utils/statementProseParse.js').ProseSection} ProseSection
 * @typedef {{
 *   sections: ProseSection[],
 *   provenance: Record<string, {origin: string, seedModifiedAt: string|null}>,
 *   source: 'seed' | 'database',
 *   loading: boolean,
 *   loaded: boolean,
 *   error: string | null
 * }} ProseState
 */

/** A database row → the shape the assembler and the editor use. */
export function fromRow(row) {
  return {
    key: row.section_key,
    position: row.position,
    generated: Boolean(row.generated),
    markdown: row.generated ? '' : normaliseMarkdown(row.body ?? ''),
  };
}

/** A section → a database row. */
export function toRow(section) {
  return {
    section_key: section.key,
    position: section.position,
    generated: Boolean(section.generated),
    // ⚠ Normalised on the way IN as well as out. A browser textarea submits
    // CRLF, and a document carrying both endings fails the assembly gate.
    body: section.generated ? null : normaliseMarkdown(section.markdown ?? ''),
  };
}

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function createStatementProseStore() {
  const { subscribe, update } = writable(/** @type {ProseState} */ ({
    sections: STATEMENT_PROSE,
    provenance: {},
    source: 'seed',
    loading: false,
    loaded: false,
    error: null,
  }));

  function adopt(sections, source, extra = {}) {
    update(s => ({
      ...s,
      sections: [...sections].sort((a, b) => a.position - b.position),
      source,
      loading: false,
      ...extra,
    }));
  }

  /** Load the prose. Falls back to the shipped text — see the header. */
  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const rows = await api.getAll('statement_prose', { orderBy: 'position' });
      if (!rows?.length) {
        logger('table is empty — using the shipped prose');
        adopt(STATEMENT_PROSE, 'seed', { loaded: true, provenance: {} });
        return;
      }
      const provenance = Object.fromEntries(rows.map(r => [r.section_key, {
        origin: r.origin, seedModifiedAt: r.seed_modified_at,
      }]));
      adopt(rows.map(fromRow), 'database', { loaded: true, provenance });
      logger('✅ loaded', rows.length, 'prose sections from the database');
    } catch (/** @type {any} */ err) {
      logger('⚠ load failed, falling back to the shipped prose:', err.message);
      adopt(STATEMENT_PROSE, 'seed', { loaded: true, error: err.message, provenance: {} });
    }
  }

  /**
   * Import the shipped prose. Idempotent on `section_key`.
   *
   * ⛔ It does NOT overwrite. A section edited here must survive an import —
   * the same rule as the register, and for the same reason: the edit is
   * somebody's considered wording, and the import is a release's default.
   *
   * @returns {Promise<{ added: string[], present: number }>}
   */
  async function importSeed() {
    const existing = await api.getAll('statement_prose', { orderBy: 'position' });
    const have = new Set((existing ?? []).map(r => r.section_key));
    const missing = STATEMENT_PROSE.filter(s => !have.has(s.key));
    if (missing.length === 0) return { added: [], present: have.size };

    const uid = await currentUserId();
    await api.createMany('statement_prose', missing.map(s => ({
      ...toRow(s), origin: 'seed', created_by: uid,
    })));
    logAudit('create', 'statement_prose', null, `${missing.length} prose sections`, {
      appId: 'admin', eventCategory: 'compliance', severity: 'info',
    });
    await load();
    return { added: missing.map(s => s.key), present: have.size + missing.length };
  }

  /**
   * Save one section's markdown.
   *
   * ⚠ Stamps `seed_modified_at` on a seeded section, exactly as the register
   * editor does. Without it a later import cannot tell "the shipped text moved"
   * from "somebody rewrote this here", and the diff has to report every
   * difference as a judgement call rather than only the ones that are.
   *
   * @param {string} key
   * @param {string} markdown
   */
  async function edit(key, markdown) {
    const state = get({ subscribe });
    const section = state.sections.find(s => s.key === key);
    if (!section) throw new Error(`no prose section "${key}"`);
    if (section.generated) {
      // ⛔ §6 is rendered from the register. A body stored against it would be
      // silently ignored, which is worse than refusing.
      throw new Error('§6 is generated from the register and cannot be edited as prose');
    }
    if (state.source !== 'database') {
      throw new Error('the prose has not been imported yet — import it before editing');
    }

    const body = normaliseMarkdown(markdown);
    if (!body.trim()) throw new Error('a section cannot be empty');

    const uid = await currentUserId();
    const before = section.markdown;
    const wasSeeded = (state.provenance[key]?.origin ?? 'seed') === 'seed';

    await api.updateMany('statement_prose', { section_key: key }, {
      body,
      updated_at: new Date().toISOString(),
      updated_by: uid,
      ...(wasSeeded ? { seed_modified_at: new Date().toISOString() } : {}),
    });

    logAudit('update', 'statement_prose', key, key, {
      appId: 'admin', eventCategory: 'compliance', severity: 'info',
      beforeData: { body: before }, afterData: { body },
    });
    await load();
  }

  /**
   * What a re-import of the shipped prose would do. Reports; changes nothing.
   *
   * ⛔ `importSeed` above only ADDS, which is safe and insufficient — a
   * corrected §3 or §4 shipped in a later release is silently declined, and the
   * only sign is that the shipped text and the stored text quietly disagree.
   * Overwriting would be worse: it discards wording somebody settled here, in a
   * document that has been through fourteen rounds of external review. So
   * neither. It reports, and a person decides.
   *
   * @returns {Promise<ReturnType<typeof diffProse>>}
   */
  async function previewImport() {
    const rows = await api.getAll('statement_prose', { orderBy: 'position' });
    const held = (rows ?? []).map(r => ({
      section: fromRow(r),
      provenance: { origin: r.origin, seedModifiedAt: r.seed_modified_at },
    }));
    return diffProse(STATEMENT_PROSE, held);
  }

  /**
   * Apply chosen additions and updates from the shipped prose.
   *
   * ⛔ ACTS ONLY ON KEYS NAMED EXPLICITLY. A divergent section — one the shipped
   * text changed AND somebody edited here — must never be swept along by an
   * "update all" over a list that happened to include it. Each of those is a
   * judgement between two considered wordings, and the caller offers them one
   * at a time.
   *
   * @param {{add?: string[], update?: string[]}} choice
   * @returns {Promise<{added: number, updated: number}>}
   */
  async function applyFromSeed(choice = {}) {
    const addKeys = new Set(choice.add ?? []);
    const updateKeys = new Set(choice.update ?? []);
    if (addKeys.size === 0 && updateKeys.size === 0) return { added: 0, updated: 0 };

    const uid = await currentUserId();
    const now = new Date().toISOString();
    const bySeedKey = new Map(STATEMENT_PROSE.map(s => [s.key, s]));

    const toAdd = [...addKeys].map(k => bySeedKey.get(k)).filter(Boolean);
    if (toAdd.length) {
      await api.createMany('statement_prose', toAdd.map(s => ({
        ...toRow(s), origin: 'seed', created_by: uid,
      })));
    }

    for (const key of updateKeys) {
      const section = bySeedKey.get(key);
      if (!section) continue;
      const row = { ...toRow(section), updated_by: uid, updated_at: now };
      delete row.section_key;
      // ⚠ Taking the shipped version makes the section match it again, so the
      // "edited here" mark is cleared — it would otherwise claim a divergence
      // that no longer exists.
      row.seed_modified_at = null;
      await api.updateMany('statement_prose', { section_key: key }, row, false);
    }

    logAudit('update', 'statement_prose', null, 'imported from the shipped prose', {
      appId: 'admin', eventCategory: 'compliance', severity: 'warning',
      afterData: { added: toAdd.length, updated: updateKeys.size },
    });
    logger('✅ applied', toAdd.length, 'additions and', updateKeys.size, 'updates');
    await load();
    return { added: toAdd.length, updated: updateKeys.size };
  }

  return { subscribe, load, importSeed, edit, previewImport, applyFromSeed };
}

export const statementProse = createStatementProseStore();
