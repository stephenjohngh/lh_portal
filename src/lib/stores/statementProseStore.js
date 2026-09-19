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

  return { subscribe, load, importSeed, edit };
}

export const statementProse = createStatementProseStore();
