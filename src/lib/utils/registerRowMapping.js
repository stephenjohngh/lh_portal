// src/lib/utils/registerRowMapping.js
//
// Between a register ENTRY (camelCase, the shape every consumer expects) and a
// `statutory_register` ROW (snake_case, what the database holds).
//
// Pure, no I/O. R1 of docs/requirements/build_plans/Register_In_The_App_Build_Plan.md.
//
// ── Why this is mechanical and not 35 hand-written pairs ─────────────────────
// A field quietly missing from a hand-written mapping is invisible: the row
// saves, the screen renders, and one piece of information is gone. That is a
// recorded failure here — `statutory_ref` and `test_type` were both lost
// between a form and the database once, and the note that came out of it was
// "diff toRow against the payload".
//
// So the conversion is derived from the field NAME, and a round-trip test
// asserts that every one of the 116 seed entries survives
// `fromRow(toRow(entry))` unchanged. Adding a field to the register needs a
// column and nothing else; forgetting the column fails the test.

/**
 * The three fields whose column cannot take the field's own name.
 * ⚠ `group` and `trigger` are SQL reserved words; `key` becomes `template_key`
 * because that is the identity `statutory_obligations` and `statutory_exclusions`
 * already link on.
 */
const RENAMED = {
  key:     'template_key',
  group:   'group_key',
  trigger: 'trigger_event',
  // ⚠ An action's `category` is WHO MUST ACT. The column says `action_` because
  // a bare `category` beside `group_key` and `basis` would read as a fourth way
  // of classifying a requirement, which it is not — it applies to one kind.
  category: 'action_category',
};

const RENAMED_BACK = Object.fromEntries(
  Object.entries(RENAMED).map(([field, column]) => [column, field]));

/**
 * ⛔ EVERY column `toRow()` may emit, declared once.
 *
 * The round-trip test asserts the MAPPING is self-consistent — and it passed
 * while `handling_note` had no column in migration 211, because nothing checked
 * the mapping against the SCHEMA. The import would have failed at insert.
 *
 * So this list is the one authoritative statement of the column set. A test
 * asserts `toRow()` emits exactly it, which means **adding a register field
 * fails that test until this list is updated** — and updating it is the prompt
 * to write the migration. Diff a new DDL against this, not against the field
 * list.
 */
export const REGISTER_COLUMNS = [
  'template_key', 'name', 'description', 'group_key', 'basis', 'statutory_ref',
  'applies_when', 'trigger_event', 'trigger_type', 'trigger_source',
  'frequency_days', 'max_interval_days', 'interval_basis',
  'source_interval_words', 'max_is_scheduling_tolerance',
  'evidenced_by', 'handled_by', 'responsible_party', 'statutory_duty_holder',
  'competency_required', 'evidence_required', 'retention_basis',
  'retention_period_months',
  'suggested_scope', 'scope_note',
  'operationally_incomplete', 'completion_action', 'assurance_only',
  'reviewer_note', 'handling_note',
  'superseded_on', 'superseded_by', 'superseded_note',
  'citation_verified_on', 'citation_verified_against',
];

/**
 * ⛔ Columns carried by the register's OTHER KINDS — actions, reasoned absences
 * and caveats — and declared apart from `REGISTER_COLUMNS` on purpose.
 *
 * ⭐ `REGISTER_COLUMNS` means "what a REQUIREMENT emits", and the test that
 * guards it asserts a two-way match against all 118 of them. Folding these in
 * would break that in the worst way: it would stop failing when a requirement
 * field lost its column, because the list would no longer be a statement about
 * requirements at all. Two kinds, two declared sets, two tests.
 *
 * ⚠ `kind` is not optional on a stored row — it is what stops an action being
 * counted as a duty — but it is defaulted in the schema, so the 118 rows that
 * predate it are requirements without anyone writing it.
 */
export const ITEM_COLUMNS = [
  'kind', 'action_category', 'priority', 'unblocks', 'consequence',
  'owner', 'technical_authority', 'due_date', 'action_status', 'sort_order',
];

/**
 * Provenance columns the DATABASE owns but the editor must be able to SHOW.
 * ⚠ Not in REGISTER_COLUMNS: `toRow()` must never write them from an entry,
 * because they record how a row came to be here rather than what it says.
 */
export const PROVENANCE_COLUMNS = [
  'origin', 'seed_modified_at', 'citation_verified_by',
];

/** Columns the database owns; never written back onto an entry. */
const DB_ONLY = new Set([
  'origin', 'seed_modified_at', 'active', 'citation_verified_by',
  'created_at', 'created_by', 'updated_at', 'updated_by',
]);

/**
 * One stored cell against one shipped cell.
 *
 * ⚠ `null` and `undefined` are the same ABSENCE. PostgREST returns null for a
 * column with no value while a seed entry simply omits the field; treating them
 * as different marks every row as changed.
 * ⚠ jsonb comes back structurally equal but not identically, hence the
 * stringify — enough for this table's scalars, arrays and small objects.
 */
export function sameCell(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * Does the SHIPPED version disagree with what is stored, about something the
 * shipped version actually says?
 *
 * ⛔ THE QUESTION IS NOT "ARE THESE TWO IDENTICAL", and getting that wrong cost
 * a real bug. The first attempt compared the union of both sides' fields — and a
 * stored row carries schema defaults the seed entry has no opinion about
 * (`kind` defaults to 'requirement', `action_status` to 'open', `sort_order` to
 * null). Every requirement therefore differed from itself on a field it does
 * not declare, and the levelling pass would have rewritten all 118 rows on
 * every single load, for ever.
 *
 * ⚠ A column the shipped version is silent on is not a disagreement. Proved
 * against real production rows: a settled register is a no-op.
 *
 * @param {Object} entry  the shipped entry
 * @param {Object} row    the stored row
 * @returns {string[]} the columns that differ, empty when nothing does
 */
export function shippedDiffers(entry, row) {
  const shipped = toRow(entry);
  return Object.keys(shipped).filter(col => !sameCell(shipped[col], row?.[col]));
}

/** camelCase → snake_case. */
export function toColumn(field) {
  return RENAMED[field] ?? field.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
}

/** snake_case → camelCase. */
export function toField(column) {
  return RENAMED_BACK[column] ?? column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Columns `statutory_register` will not accept as null, BY KIND.
 *
 * ⛔ THIS EXISTS BECAUSE ALL 65 ITEM ROWS WERE UNINSERTABLE AND NOTHING SAID
 * SO. `group_key` and `basis` were NOT NULL with no default, so every action,
 * absence and caveat failed on insert, every load, for a week — and the
 * levelling caught it and blamed the reader's permissions. Migration 217 makes
 * the two columns nullable and keeps them required for a requirement, which is
 * where they mean anything. PROJECT_STATUS §6kk.
 *
 * ⚠ THIS IS A DECLARED COPY OF A SCHEMA FACT, and a second copy of a fact is
 * what this project keeps finding stale. It is here because a unit test has no
 * database to ask, and the alternative — finding out in production that a row
 * cannot be written — is what just happened. **If migration 217's constraint
 * changes, change this too**; the test below is what will notice the shipped
 * seed disagreeing with it, not a schema drift.
 */
export const REQUIRED_COLUMNS = {
  requirement: ['template_key', 'name', 'group_key', 'basis'],
  action:      ['template_key', 'name'],
  absence:     ['template_key', 'name'],
  caveat:      ['template_key', 'name'],
};

/**
 * A register entry as a database row.
 * @param {Object} entry
 * @returns {Object}
 */
export function toRow(entry) {
  /** @type {Record<string, any>} */
  const row = {};
  for (const [field, value] of Object.entries(entry ?? {})) {
    row[toColumn(field)] = value;
  }
  return row;
}

/**
 * A database row as a register entry, dropping the columns the database owns.
 *
 * ⚠ `undefined`, not `null`, for a column with no value — because the seed
 * distinguishes the two. `citationVerifiedAgainst` is ABSENT on a row whose
 * citation was never individually checked, and present on one that was; a null
 * would make "checked and found nothing" indistinguishable from "never
 * checked", which is the distinction the whole provenance model rests on.
 *
 * @param {Object} row
 * @returns {Object}
 */
export function fromRow(row) {
  /** @type {Record<string, any>} */
  const entry = {};
  for (const [column, value] of Object.entries(row ?? {})) {
    if (DB_ONLY.has(column)) continue;
    if (value === null && OPTIONAL_COLUMNS.has(column)) continue;
    entry[toField(column)] = value;
  }
  return entry;
}

/**
 * Columns that are ABSENT rather than null on a seed entry. Everything else
 * carries an explicit null from the `entry()` factory's defaults, and must keep
 * carrying it — dropping those would change what the register says.
 */
const OPTIONAL_COLUMNS = new Set([
  'citation_verified_on', 'citation_verified_against',
  'suggested_scope', 'scope_note', 'reviewer_note', 'trigger_type',
]);
