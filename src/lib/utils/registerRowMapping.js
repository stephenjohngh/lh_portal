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
};

const RENAMED_BACK = Object.fromEntries(
  Object.entries(RENAMED).map(([field, column]) => [column, field]));

/** Columns the database owns; never written back onto an entry. */
const DB_ONLY = new Set([
  'origin', 'seed_modified_at', 'active',
  'created_at', 'created_by', 'updated_at', 'updated_by',
]);

/** camelCase → snake_case. */
export function toColumn(field) {
  return RENAMED[field] ?? field.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
}

/** snake_case → camelCase. */
export function toField(column) {
  return RENAMED_BACK[column] ?? column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

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
