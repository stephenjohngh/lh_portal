// src/lib/utils/registerKinds.js
//
// What a register row can BE, and the vocabulary for saying so.
//
// ⭐ THE DECISION THIS FILE EXISTS FOR. The obligations statement used to be a
// Word document: the 118 requirements, wrapped in 550 lines of prose. Most of
// that prose explained our own design to its reader — what a catalogue is, how
// to read an interval label — and the parts that earned their place were not
// prose at all. They were LISTS: outstanding actions, reasoned absences, and
// caveats about what the register does not claim.
//
// A list written as prose cannot be filtered, counted, assigned or exported, and
// it goes stale in silence — four of that document's own tallies decayed because
// they were sentences about a table rather than queries over it.
//
// So they are rows, and a REPORT IS A PRESET: a set of kinds, a filter and some
// options. The statement, the extract, the gap report and the actions schedule
// are the same list seen four ways, and the screen, the spreadsheet and the Word
// file all take the same three things.
//
// ⛔ A KIND IS NEVER COUNTED AS ANOTHER. The error this register has found more
// than any other — six times — is collapsing two obligations into one row so
// that satisfying one reads as satisfying both. `STATUTORY_TEMPLATE` and
// `activeRegister()` therefore keep meaning THE REQUIREMENTS; anything wanting
// another kind asks for it by name. Existing consumers stay correct because they
// never see an action, not because they remember not to count it.
//
// ⚠ NO IMPORTS, deliberately. The compliance guard scripts run under plain node
// with no Vite, so anything they need has to be importable without `$lib`.

/** @typedef {'requirement'|'action'|'absence'|'caveat'} RegisterKind */

/**
 * The four kinds, in the order a document prints them.
 *
 * ⚠ `blurb` is what the screen shows to say what you are looking at — the
 * user's requirement was "clear options to user as [to] what they are seeing",
 * and a kind filter that just says "Action" does not meet it.
 */
export const REGISTER_KINDS = [
  {
    key: 'requirement',
    label: 'Requirements',
    one: 'Requirement',
    blurb: 'A duty this kind of building has, with a cadence and a way of evidencing it.',
  },
  {
    key: 'action',
    label: 'Outstanding actions',
    one: 'Action',
    blurb: 'Something to be decided or done ONCE — not a recurring duty. Each one has a consequence if it is not.',
  },
  {
    key: 'absence',
    label: 'Reasoned absences',
    one: 'Reasoned absence',
    blurb: 'A duty a reader might expect to find here, and why it is deliberately not in the list.',
  },
  {
    key: 'caveat',
    label: 'What this list does not claim',
    one: 'Caveat',
    blurb: 'A limit on what the register asserts. ⚠ A statement of intent read as a statement of performance is the most damaging way for it to be wrong.',
  },
];

/** @type {Record<string, string>} */
export const KIND_LABEL = Object.fromEntries(REGISTER_KINDS.map(k => [k.key, k.one]));

/** Every kind key, in print order. */
export const KIND_KEYS = REGISTER_KINDS.map(k => k.key);

/**
 * For an action: WHO MUST ACT.
 *
 * ⭐ This is the primary grouping for actions and the reason the A/D/H numbering
 * turned out not to be a distinction at all. The statement numbered its actions
 * A1–A23, the delivery plan D1–D19 and the human backlog H1–H7 — and the
 * delivery plan's own tables already interleaved them. They are one kind of
 * thing with three numbering origins; the real division is this one, which is
 * how the delivery plan was already organised.
 *
 * ⛔ AND PRIORITY ACROSS THESE WOULD BE FICTION. The duty holder cannot do the
 * fire engineer's work, and neither of them can write software. Order within a
 * category; never sort the whole list by priority and call the top of it "next".
 */
export const ACTION_CATEGORIES = [
  { key: 'duty_holder_decision',    label: 'Decisions only the duty holder can make',
    blurb: 'Not technical questions with right answers — choices about how this building is run.' },
  { key: 'technical_determination', label: 'Technical determinations',
    blurb: 'Needs a competent person. A guess here would be indistinguishable afterwards from a determination.' },
  { key: 'information',             label: 'Information to obtain',
    blurb: 'A document or a fact that exists somewhere and is not held here.' },
  { key: 'process',                 label: 'Processes to establish',
    blurb: 'An operational control that has to exist before a row relying on it means anything.' },
  { key: 'record',                  label: 'Records to create',
    blurb: 'Something to enter in the portal — the half only a person can supply.' },
  { key: 'software',                label: 'Software that does not exist yet',
    blurb: 'Named here so a row that depends on it cannot read as controlled.' },
  { key: 'interface',               label: 'Interfaces with other parties',
    blurb: 'An arrangement with an agent, a resident system, or the fire and rescue authority.' },
  { key: 'testing',                 label: 'Testing by a person',
    blurb: 'Built and never exercised by a human. ⚠ Admin pass first, ordinary user later — that is a sequence, not an oversight.' },
];

/** @type {Record<string, string>} */
export const ACTION_CATEGORY_LABEL =
  Object.fromEntries(ACTION_CATEGORIES.map(c => [c.key, c.label]));

/**
 * Priority, and it only ever orders WITHIN a category.
 * ⚠ The markers are the ones the source documents used, kept so a reader moving
 * between them is not learning a second vocabulary.
 */
export const ACTION_PRIORITIES = [
  { key: 'critical', label: 'Critical', marker: '🔴' },
  { key: 'high',     label: 'High',     marker: '🟠' },
  { key: 'medium',   label: 'Medium',   marker: '🟡' },
];

/** @type {Record<string, string>} */
export const PRIORITY_MARKER =
  Object.fromEntries(ACTION_PRIORITIES.map(p => [p.key, p.marker]));

/** @type {Record<string, string>} */
export const PRIORITY_LABEL =
  Object.fromEntries(ACTION_PRIORITIES.map(p => [p.key, p.label]));

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2 };

/**
 * An action's rank within its category. Unset priority sorts last rather than
 * first — an unprioritised item is not urgent, it is unassessed.
 */
export const priorityRank = a => PRIORITY_RANK[a?.priority] ?? 9;

/** The kind of a row, defaulting to the one 118 of them are. */
export const kindOf = row => row?.kind ?? 'requirement';

/** Rows of one kind. The explicit ask that keeps the other kinds out of a tally. */
export const ofKind = (rows, kind) => (rows ?? []).filter(r => kindOf(r) === kind);

/**
 * ⛔ THE GUARD AGAINST THE ERROR THIS FILE'S HEADER NAMES. A tally must account
 * for every row it was given and must never merge two kinds into one number.
 *
 * @param {Object[]} rows
 * @returns {Record<RegisterKind, number> & {total: number}}
 */
export function kindTally(rows) {
  const out = /** @type {any} */ ({ total: (rows ?? []).length });
  for (const k of KIND_KEYS) out[k] = 0;
  for (const r of rows ?? []) {
    const k = kindOf(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
