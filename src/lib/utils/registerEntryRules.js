// src/lib/utils/registerEntryRules.js
//
// What must be true of ANY register entry — seeded or typed here.
//
// R2 of docs/requirements/build_plans/Register_In_The_App_Build_Plan.md.
//
// ── Why this is not `check:register` ─────────────────────────────────────────
// `check:register` holds 173 claims asserting that specific legal corrections
// landed — "the Management of Safety Risks Regs are SI 2023/907, not
// SI 2023/1163". Those are claims about the SEED, they run at build time, and
// ⛔ they are gitignored: they do not ship.
//
// They also cannot cover a row a user adds, because the seed has never seen it.
//
// ⭐ The distinction the plan draws: **`check:register` says "this correction is
// still here"; this says "this row is well-formed".** Different jobs, and only
// the second can ship.
//
// Pure, Type-1 testable, no I/O.

import { GROUPS, BASIS } from './statutoryTemplate.js';
import { EVIDENCE_ROUTES } from './obligationEvidence.js';

/** A key must be a slug: it becomes a primary key and appears in URLs and refs. */
const KEY_SHAPE = /^[a-z][a-z0-9_]{2,59}$/;

/**
 * Problems with an entry, most structural first. Empty means it is well-formed.
 *
 * @param {Object} entry                a register entry (camelCase)
 * @param {{existingKeys?: Set<string>, isNew?: boolean}} [ctx]
 * @returns {{field: string, problem: string}[]}
 */
export function validateRegisterEntry(entry, ctx = {}) {
  const e = entry ?? {};
  const out = [];
  const fail = (field, problem) => out.push({ field, problem });
  const blank = (v) => v === null || v === undefined || String(v).trim() === '';

  // ── Identity ──────────────────────────────────────────────────────────────
  if (blank(e.key)) {
    fail('key', 'A key is required — it is the identity obligations and decisions link on.');
  } else if (!KEY_SHAPE.test(e.key)) {
    fail('key', 'Lower case, digits and underscores only, 3–60 characters, starting with a letter.');
  } else if (ctx.isNew && ctx.existingKeys?.has(e.key)) {
    fail('key', 'That key is already in the register.');
  }

  if (blank(e.name)) fail('name', 'A name is required.');
  if (blank(e.description)) fail('description', 'A description is required — what the check actually involves.');

  if (!GROUPS.includes(e.group)) fail('group', 'Choose a group.');
  if (!BASIS.includes(e.basis))  fail('basis', 'Choose where the requirement comes from.');

  // ⛔ A citation is required. An entry that cannot say what requires it is not
  // a register entry — it is a note. This register's whole discipline is that a
  // reader can tell law from convention, and the citation is where that lives.
  if (blank(e.statutoryRef)) {
    fail('statutoryRef', 'A reference is required — the instrument, standard or contract that requires this.');
  }

  // Applicability: the catalogue rule is "condition, do not assert". A row with
  // no stated condition claims it always applies, which is a claim.
  if (blank(e.appliesWhen)) {
    fail('appliesWhen', 'State when this applies — "Always" is a valid answer, an empty box is not.');
  }

  // ── Cadence ───────────────────────────────────────────────────────────────
  const schedulable = EVIDENCE_ROUTES.includes(e.evidencedBy);

  // ⚠ A schedulable obligation with no frequency can never fall due, so it
  // reads "never run" for ever. The register's own tests found this once, on
  // the BAC row, and the fix there was to stop it being schedulable.
  if (schedulable && !(Number(e.frequencyDays) > 0) && !e.trigger) {
    fail('frequencyDays',
      'A schedulable requirement needs a frequency or a trigger, or it can never fall due and will read "never run" for ever.');
  }

  // ⛔ The round-14 rule, generalised. No instrument anywhere says "366 days";
  // that is our arithmetic on the word "annual". A day ceiling must therefore
  // say which it is: the source's period in words, or ours.
  if (Number(e.maxIntervalDays) > 0
      && blank(e.sourceIntervalWords) && !e.maxIsSchedulingTolerance) {
    fail('maxIntervalDays',
      'A maximum interval must either quote the source’s period in words, or be marked as our own scheduling tolerance. A bare day count reads as the law.');
  }

  // ⚠ And it must not exceed the period it stands for.
  if (Number(e.maxIntervalDays) > 0 && Number(e.frequencyDays) > Number(e.maxIntervalDays)) {
    fail('frequencyDays', 'The planned frequency is looser than this row’s own maximum interval.');
  }

  return out;
}

/** Convenience for a form: `{ field: problem }`, first problem per field. */
export function problemsByField(entry, ctx) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const { field, problem } of validateRegisterEntry(entry, ctx)) {
    if (!map[field]) map[field] = problem;
  }
  return map;
}

/**
 * Derive a key from a name, for a new entry. A suggestion the person can change
 * — the key is permanent once obligations link to it.
 * @param {string} name
 */
export function suggestKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/^([0-9])/, 'r$1');
}
