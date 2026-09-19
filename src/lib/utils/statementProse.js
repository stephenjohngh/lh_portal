// src/lib/utils/statementProse.js
//
// The PROSE of the obligations statement — everything that is not the register.
//
// R5 of docs/requirements/build_plans/Register_In_The_App_Build_Plan.md.
//
// ── What this is for ────────────────────────────────────────────────────────
// §6 became data in R4 and generates from the register. The rest of the
// document — what it is, the building, the catalogue rule, how to read a row,
// the two governing principles, the reasoned absences and the numbered actions
// — is prose, written and edited by a person. It is 548 of the document's 2,901
// lines, and it is the remaining reason producing the statement needs one
// particular laptop.
//
// ⛔ THE SEED IS NOT A MIGRATION AND NOT A DOC. `supabase/migrations/` and
// `docs/` are both gitignored, so neither would ever reach a second deployment.
// The prose ships as `../content/statementProse.md` — committed, in `src/` —
// and is imported into `statement_prose` from there, exactly as the register is
// imported from `statutoryRegisterData.js`.
//
// ⚠ `?raw` IS A VITE FEATURE. It works in the app and under vitest; it does not
// exist in a plain `node scripts/…` run, which is what the gate is. That is why
// the parser lives in `statementProseParse.js` with no imports of its own, and
// why the prose is a readable markdown file rather than a string literal: the
// gate reads the file itself and parses it with the same code the app uses.

import SEED from '../content/statementProse.md?raw';
import { parseProse } from './statementProseParse.js';

export { parseProse };

/** @typedef {import('./statementProseParse.js').ProseSection} ProseSection */

/** The shipped prose. Once imported, the editable copy is `statement_prose`. */
export const STATEMENT_PROSE = parseProse(SEED);

/** The section whose place §6 takes in the running order. */
export const REGISTER_SECTION_KEY =
  STATEMENT_PROSE.find(s => s.generated)?.key ?? 'register';
