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
// seed there would never reach a second deployment. The requirements stay in
// `statutoryRegisterData.js` — committed, shipping — and reach the table from
// here, idempotently on `template_key`.
//
// ⭐ AND THAT IS INVISIBLE TO WHOEVER IS LOOKING AT THE SCREEN, which is the
// point of `levelWithSeed` below. The user's words, and they are the
// requirement: *"the position the user sees is a ready populated db, whether
// that came from our initial load or someone used 'Add new' 118 times shouldn't
// matter and they shouldn't be able to see the difference."*
//
// ⚠ IT USED TO BE A BUTTON, and that was the mistake. "Import 118
// requirements", then "Check against the standard register · 2 new · Add all
// 2". Every one of those is deployment plumbing dressed as a compliance task —
// the register has to start in the database rather than in a migration, and I
// made that the user's problem. The two things they actually came to do are
// *which of these apply to this building* and *what work discharges each*;
// nothing else belongs in front of them.
//
// ⚠ The seed fallback stays, for a reader who cannot write the table: an empty
// register renders as "no requirements", which is the most dangerous thing a
// compliance screen could say.

import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { supabase } from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';
import { logAudit } from '$lib/utils/auditLogger';
import { STATUTORY_TEMPLATE, setActiveRegister } from '$lib/utils/statutoryTemplate.js';
import { REGISTER_ITEMS } from '$lib/utils/registerItemsData.js';
import { ofKind, kindOf } from '$lib/utils/registerKinds.js';
import { toRow, fromRow, shippedDiffers } from '$lib/utils/registerRowMapping.js';
import { validateRegisterEntry } from '$lib/utils/registerEntryRules.js';
import { diffRegister, fieldChanges } from '$lib/utils/registerDiff.js';

const logger = getLogger('statutoryRegister');

/**
 * Everything that ships: the requirements, and the actions, reasoned absences
 * and caveats that used to be prose in the obligations statement.
 *
 * ⚠ Declared once because it is used twice — levelling the table, and as the
 * fallback when the table cannot be read. Those two falling out of step would
 * mean a reader who cannot write the table sees a DIFFERENT register from one
 * who can, which is the worst kind of difference to have.
 */
const SHIPPED = [...STATUTORY_TEMPLATE, ...REGISTER_ITEMS];

/**
 * ⛔ `entries` IS THE REQUIREMENTS AND NOTHING ELSE. `items` is everything the
 * register holds — requirements, outstanding actions, reasoned absences and
 * caveats. They are separate fields rather than one list with a filter, and
 * that is the safeguard rather than a convenience: every consumer written
 * before actions existed reads `entries`, so an action cannot be counted as a
 * duty by code that has never heard of actions. "118 checks identified" cannot
 * quietly become 183.
 *
 * @typedef {{
 *   entries: Object[],
 *   items: Object[],
 *   source: 'seed' | 'database',
 *   loading: boolean,
 *   loaded: boolean,
 *   error: string | null
 * }} RegisterState
 */

/**
 * Columns a stored row owns even though the shipped version states them.
 *
 * ⛔ A CITATION CHECK RECORDED HERE IS NOT A LOCAL EDIT, AND LEVELLING USED TO
 * UNDO IT. `recordCitationVerification` deliberately does not stamp
 * `seed_modified_at` — checking a citation changes nothing the row SAYS — so on
 * the fourteen rows that ship with a verification of their own, the next load
 * saw the shipped date and URL "disagree" with the stored ones and silently put
 * the shipped values back, leaving the recorder's name against somebody else's
 * check. `citation_verified_by` is written only by that act, so it is the proof
 * the verification is this building's.
 */
const CITATION_COLUMNS = new Set(['citation_verified_on', 'citation_verified_against']);
function keptHere(row, column) {
  return CITATION_COLUMNS.has(column) && row?.citation_verified_by != null;
}

function createStatutoryRegisterStore() {
  const { subscribe, update } = writable(/** @type {RegisterState} */ ({
    entries: STATUTORY_TEMPLATE,
    items:   [...STATUTORY_TEMPLATE, ...REGISTER_ITEMS],
    provenance: /** @type {Record<string, any>} */ ({}),
    source:  'seed',
    loading: false,
    loaded:  false,
    error:   null,
  }));

  /**
   * Point the pure helpers at whatever we just read, and record which it was.
   *
   * ⚠ `setActiveRegister` is given the REQUIREMENTS only. It backs
   * `activeRegister()`, which every coverage, scheduling and statement helper
   * reads — none of which has any business seeing an action.
   */
  function adopt(items, source, extra = {}) {
    const entries = ofKind(items, 'requirement');
    setActiveRegister(entries);
    update(s => ({ ...s, entries, items, source, loading: false, ...extra }));
  }

  /**
   * Bring the table level with the shipped register, silently.
   *
   * ⭐ THE RULE, AND IT IS THE WHOLE OF IT:
   *   · a requirement the table does not have  → ADD it
   *   · a requirement nobody here has edited   → take the shipped version
   *   · a requirement somebody here HAS edited → never touch it
   *
   * ⛔ WHY THIS IS SILENT. It used to be a button — "Import 118 requirements",
   * then "Check against the standard register · 2 new · Add all 2". That is
   * DEPLOYMENT PLUMBING wearing the clothes of a compliance task. The register
   * has to start in the database rather than in a migration (migrations are
   * gitignored and would never reach a second deployment), and I pushed that
   * fact into the workflow of the person using the screen. From where they sit
   * the register simply IS the building's list of duties: whether a row arrived
   * from the shipped seed or somebody typed it should be invisible, and it now
   * is.
   *
   * ⚠ The "nobody here has edited it" test is `seed_modified_at`, set by the
   * editor on every save. Without it there is no way to tell "the shipped text
   * moved" from "somebody rewrote this here", because we hold the current seed
   * and the current row and never the seed as it was at import.
   *
   * ⚠ A row the table has and the seed does NOT is left alone — a release
   * withdrawing a requirement is not a licence to delete one that obligations
   * and applicability decisions may still link to.
   *
   * @param {Object[]} rows  what the table currently holds
   * @returns {Promise<number>} how many rows were written
   */
  async function levelWithSeed(rows) {
    const byKey = new Map((rows ?? []).map(r => [r.template_key, r]));

    // ⚠ Both kinds. Levelling only the requirements would leave the actions,
    // absences and caveats permanently a release behind, silently.
    const missing = SHIPPED.filter(e => !byKey.has(e.key));
    // ⛔ COMPARED ON WHAT THE SHIPPED VERSION ACTUALLY STATES, column by column,
    // and NOT through `fieldChanges`. That was the first attempt and it was
    // wrong in a way worth recording: `fieldChanges` walks the UNION of both
    // sides' keys, and a stored row carries schema defaults the seed entry has
    // no opinion about — `kind` defaults to 'requirement', `action_status` to
    // 'open'. So every requirement differed from itself on a field it does not
    // declare, and every load would have rewritten all 118 rows, for ever.
    //
    // ⚠ The question is not "are these two objects identical" but "does the
    // shipped version disagree with what is stored, about something the shipped
    // version says". A column it is silent on is not a disagreement.
    const updatable = SHIPPED.filter((e) => {
      const row = byKey.get(e.key);
      if (!row || row.seed_modified_at) return false;   // absent, or edited here
      return shippedDiffers(e, row).filter(c => !keptHere(row, c)).length > 0;
    });

    if (!missing.length && !updatable.length) return 0;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (missing.length) {
        await api.createMany('statutory_register', missing.map(e => ({
          ...toRow(e), origin: 'seed', created_by: user?.id ?? null,
        })));
      }
      for (const e of updatable) {
        const shipped = toRow(e);
        const row = byKey.get(e.key);
        for (const c of Object.keys(shipped)) if (keptHere(row, c)) delete shipped[c];
        await api.updateMany('statutory_register', { template_key: e.key }, {
          ...shipped, updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
        }, false);
      }

      logAudit('update', 'statutory_register', null, 'register levelled with the shipped version', {
        appId: 'compliance', eventCategory: 'compliance', severity: 'info',
        afterData: { added: missing.length, updated: updatable.length },
      });
      logger('✅ levelled:', missing.length, 'added,', updatable.length, 'updated');
      return missing.length + updatable.length;
    } catch (/** @type {any} */ err) {
      // ⚠ A PERMISSION FAILURE HERE IS NOT AN ERROR CONDITION. Only an admin
      // may write this table, so a viewer reaching an empty or behind table
      // simply reads the shipped register instead. Failing loudly would put a
      // compliance screen into an error state over something the reader cannot
      // act on.
      //
      // ⛔ BUT THIS USED TO SAY "likely not an admin" FOR EVERY FAILURE, AND
      // THAT SENTENCE HID A REAL DEFECT FOR A WEEK. All 65 actions, absences
      // and caveats violated NOT NULL on `group_key` and `basis`, so the
      // insert threw on every single load — and the log line explained it away
      // as a permissions problem, which reads like an expected non-event.
      // Migration 217 fixes the schema; this stops the message asserting a
      // cause it has not established. PROJECT_STATUS §6kk.
      //
      // ⭐ A guessed cause in a log is worse than no cause: it stops the next
      // person looking.
      const denied = /permission|row-level security|not authoriz|forbidden|401|403/i
        .test(err?.message ?? '');
      if (denied) logger('not levelled — this reader may not write the register');
      else logger('⚠ LEVELLING FAILED, and not because of permissions:', err?.message ?? err);
      return 0;
    }
  }

  /**
   * Load the register, bringing it level with the shipped version first.
   *
   * ⚠ The seed fallback stays, and it is not merely defensive: an empty
   * register renders as "no requirements", which is the most dangerous thing a
   * compliance screen could say. It is now only reached when the table cannot
   * be written AND cannot be read — a viewer on a fresh deployment, or no
   * network.
   */
  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      let rows = await api.getAll('statutory_register', { orderBy: 'template_key' });
      if (await levelWithSeed(rows ?? [])) {
        rows = await api.getAll('statutory_register', { orderBy: 'template_key' });
      }
      if (!rows?.length) {
        logger('table is empty and could not be seeded — using the shipped register');
        adopt(SHIPPED, 'seed', { loaded: true });
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
      adopt(SHIPPED, 'seed', { loaded: true, error: err.message });
    }
  }

  // ⛔ `importSeed()` WAS HERE AND IS DELETED, not merely unused.
  //
  // It did what `levelWithSeed` now does on every load — insert what the table
  // is missing — and keeping both meant two code paths that write the same rows
  // for the same reason. A test caught the overlap honestly: with the table
  // mocked empty, `importSeed` inserted and then its own call to `load()`
  // inserted again.
  //
  // ⚠ That is this project's most-repeated finding applied to code rather than
  // prose: a fact written in two places goes wrong in the place you are not
  // editing, and a CHECK — or a WRITE — written twice is the same shape. The
  // levelling pass is the one path, it runs without being asked, and there is
  // nothing left for a person to press.

  /**
   * What a re-import of the shipped seed would do. R3.
   *
   * ⛔ Reports; changes nothing. R1's import only ADDED, which is safe and
   * insufficient — a corrected citation shipped in a later release would be
   * silently declined. Overwriting would be worse. So it is a diff, and a
   * person decides.
   *
   * @returns {ReturnType<typeof diffRegister>}
   */
  function previewImport() {
    const s = get({ subscribe });
    const held = s.entries.map(entry => ({
      entry, provenance: s.provenance?.[entry.key] ?? {},
    }));
    return diffRegister(STATUTORY_TEMPLATE, held);
  }

  /**
   * Take named changes from the shipped seed.
   *
   * @param {{add?: string[], update?: string[]}} choice  keys, chosen by a person
   *
   * ⛔ Nothing is implicit. A key must be named to be acted on, so a divergent
   * row cannot be swept along by an "update all" over a list that happened to
   * include it. The caller decides what goes in `update`; the UI only offers
   * the untouched ones by default, and a divergent row one at a time.
   */
  async function applyFromSeed(choice = {}) {
    const addKeys    = new Set(choice.add ?? []);
    const updateKeys = new Set(choice.update ?? []);
    if (addKeys.size === 0 && updateKeys.size === 0) {
      return { added: 0, updated: 0 };
    }

    const uid = await currentUserId();
    const now = new Date().toISOString();
    const bySeedKey = new Map(STATUTORY_TEMPLATE.map(e => [e.key, e]));

    const toAdd = [...addKeys].map(k => bySeedKey.get(k)).filter(Boolean);
    if (toAdd.length) {
      await api.createMany('statutory_register', toAdd.map(e => ({
        ...toRow(e), origin: 'seed', created_by: uid,
      })));
    }

    for (const key of updateKeys) {
      const entry = bySeedKey.get(key);
      if (!entry) continue;
      const row = { ...toRow(entry), updated_by: uid, updated_at: now };
      delete row.template_key;
      // ⚠ Taking the standard register's version makes the row match it again,
      // so the "edited here" mark is cleared. It would otherwise claim a
      // divergence that no longer exists.
      row.seed_modified_at = null;
      await api.updateMany('statutory_register', { template_key: key }, row, false);
    }

    logAudit('update', 'statutory_register', null, 'imported from the standard register', {
      appId: 'compliance', eventCategory: 'compliance', severity: 'warning',
      afterData: { added: toAdd.length, updated: updateKeys.size },
    });
    logger('✅ applied', toAdd.length, 'additions and', updateKeys.size, 'updates');
    await load();
    return { added: toAdd.length, updated: updateKeys.size };
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
      appId: 'compliance', eventCategory: 'compliance', severity: 'warning',
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
    if (wasSeeded(key)) {
      // ⚠ An edit that puts the shipped wording BACK is not a divergence, and
      // must not be recorded as one. Stamping it regardless meant "undo your
      // edit" left the row badged *Edited* for ever and excluded it from every
      // later release's corrections — the cost the tutorial tells people they
      // are avoiding by undoing. Citation columns are left out of the
      // comparison: a check recorded here is not an edit of what the row says.
      const shipped = SHIPPED.find(e => e.key === key);
      const differs = shipped
        ? shippedDiffers(shipped, toRow(merged)).some(c => !CITATION_COLUMNS.has(c))
        : true;
      row.seed_modified_at = differs ? new Date().toISOString() : null;
    }

    await api.updateMany('statutory_register', { template_key: key }, row, false);
    logAudit('update', 'statutory_register', key, merged.name, {
      appId: 'compliance', eventCategory: 'compliance', severity: 'warning',
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
      appId: 'compliance', eventCategory: 'compliance', severity: 'info',
      afterData: { citation_verified_against: evidence.url },
    });
    await load();
  }

  /**
   * Remove a requirement that was added here by mistake.
   *
   * ⛔ `origin: 'local'` ONLY, and the restriction is not timidity.
   * · The register's rule is **delete only for NEVER**, which is about
   *   requirements that exist in law and do not apply to this building — those
   *   get a recorded applicability decision, not a delete. **An entry added by
   *   mistake has no legal existence at all**, which is the same category as
   *   the gas row that was knowingly deleted.
   * · And deleting a SEEDED row would be futile as well as wrong: the next
   *   import would simply bring it back.
   *
   * ⛔ Refuses if anything links to the key. An obligation whose `template_key`
   * points at nothing is skipped by `templateCoverage()` entirely — its walks
   * and jobs still exist while the register can no longer say what they were
   * for. An applicability decision for a key that does not exist is a recorded
   * decision about nothing.
   *
   * ⚠ The removed row goes into the audit log as `beforeData`, so the delete is
   * recoverable in the one place that outlives it.
   *
   * @param {string} key
   * @param {string} reason
   */
  async function withdrawLocal(key, reason) {
    const state = get({ subscribe });
    const entry = state.entries.find(e => e.key === key);
    if (!entry) throw new Error(`No register entry ${key}`);

    if (state.provenance?.[key]?.origin !== 'local') {
      throw new Error(
        'Only a requirement added here can be withdrawn. This one came from the standard '
        + 'register — if it does not apply to this building, record it as not applicable; '
        + 'if it has been withdrawn in law, retire it. Deleting it would also be undone by '
        + 'the next import.');
    }
    if (!reason?.trim() || reason.trim().length < 8) {
      throw new Error('A reason is required — it is what the audit log will carry in place of the row.');
    }

    const [obligations, decisions] = await Promise.all([
      api.get('statutory_obligations', { select: 'id, name', filters: { template_key: key } }),
      api.get('statutory_exclusions',  { select: 'id',       filters: { template_key: key } }),
    ]);

    const links = [];
    if (obligations?.length) links.push(`${obligations.length} obligation${obligations.length === 1 ? '' : 's'}`);
    if (decisions?.length)   links.push(`${decisions.length} applicability decision${decisions.length === 1 ? '' : 's'}`);
    if (links.length) {
      throw new Error(
        `${links.join(' and ')} still link to this requirement. Removing it would leave that `
        + 'evidence pointing at a requirement nothing can describe. Retire or delete those first.');
    }

    const uid = await currentUserId();
    await api.deleteMany('statutory_register', { template_key: key });

    logAudit('delete', 'statutory_register', key, entry.name, {
      appId: 'compliance', eventCategory: 'compliance', severity: 'warning',
      beforeData: { ...toRow(entry), origin: 'local' },
      afterData:  { withdrawn_reason: reason.trim(), withdrawn_by: uid },
    });
    logger('✅ withdrew local requirement', key);
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
    subscribe, load, usingSeed,
    create, edit, recordCitationVerification,
    previewImport, applyFromSeed, withdrawLocal,
  };
}

export const statutoryRegister = createStatutoryRegisterStore();
