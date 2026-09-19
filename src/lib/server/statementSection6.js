// src/lib/server/statementSection6.js
//
// §6 of the obligations statement — the register — rendered from register
// entries. R4 of `requirements/build_plans/Register_In_The_App_Build_Plan.md`.
//
// ⛔ THIS IS GATED, AND THE GATE IS THE POINT. Nothing switches over to a
// generated §6 until this renderer reproduces the CURRENT §6 byte-for-byte for
// rows nobody has edited. Round 8 rebuilt §6 once and only dared to because a
// renderer written for the purpose reproduced 92 of 103 entries exactly, the
// other 11 being precisely the rows that round had changed. `npm run
// check:statement-render` is that same gate, kept.
//
// ⚠ THE DOCUMENT HAS ITS OWN VOCABULARY, and it is not the app's. The screen
// says "Management decision"; the statement says "Our own decision". The screen
// says "6-Monthly"; the statement says "Six-monthly". They are written for
// different readers and the wording was settled over fourteen review rounds, so
// the labels here are deliberately NOT imported from `statutoryTemplate.js`.
// Sharing them would quietly rewrite a reviewed document the next time a screen
// label was improved.

// ⚠ Imported by RELATIVE path, not `$lib`. The gate script runs under plain
// node with no bundler, and `triggerTypeOf` is a DERIVATION — re-implementing
// it here would be a second copy of a rule, which is the fault this project
// keeps finding. `statutoryTemplate.js` has no `$lib` imports of its own, so
// the relative path resolves for both node and Vite.
import { triggerTypeOf } from '../utils/statutoryTemplate.js';

/** "Why we hold it" — the outward-facing wording, not the screen's. */
const BASIS_LABEL = {
  statute: 'Legislation',
  standard: 'Standard or code',
  contract: 'Contract or scheme',
  management: 'Our own decision',
};

/** "What makes it fall due". */
const TRIGGER_LABEL = {
  calendar: 'Calendar',
  event: 'Event',
  risk: 'Risk or condition',
  direction: 'On direction',
};

/** How often, in the document's words. */
export function intervalLabel(entry) {
  const days = entry?.frequencyDays;
  if (!days) {
    return triggerTypeOf(entry) === 'direction'
      ? 'On direction — no fixed statutory cycle'
      : 'On event — no fixed cycle';
  }
  // ⚠ An assurance-only row says what it IS, not merely how often. A reader
  // skimming "Annual" would take the statutory process to be checked annually,
  // which is the conflation those rows were split apart to prevent.
  if (entry.assuranceOnly) return 'Annual assurance confirmation';
  if (days === 1) return 'Daily';
  if (days === 7) return 'Weekly';
  if (days === 30 || days === 31) return 'Monthly';
  if (days >= 84 && days <= 92) return 'Quarterly';
  if (days >= 175 && days <= 183) return 'Six-monthly';
  if (days >= 364 && days <= 366) return 'Annual';
  if (days === 730) return 'Two-yearly';
  if (days % 365 === 0) return `Every ${days / 365} years`;
  return `Every ${days} days`;
}

/** "Where the interval comes from". */
export function intervalSourceLabel(entry) {
  if (!entry?.frequencyDays) return 'Not a cycle — see the trigger';
  if (entry.intervalBasis !== 'stated') {
    return 'Established practice — the reference sets the duty, not the frequency';
  }
  // ⚠ Round 13: on a STANDARD-based row, "stated in the reference" has to say
  // what it means. A standard states a period for a kind of system; what
  // governs here is the edition and configuration of THIS installation.
  return entry.basis === 'standard'
    ? 'Stated in the reference — meaning the edition and configuration that govern '
      + 'THIS installation, not a period universal to every system of the kind'
    : 'Stated in the reference';
}

/** Retention, in years. */
export function retentionLabel(months) {
  if (!months) return null;
  const years = months / 12;
  return Number.isInteger(years) ? `${years} year${years === 1 ? '' : 's'}` : `${months} months`;
}

/**
 * What the day figure is qualified with, where the row declares it to be ours.
 * ⚠ Keyed by basis because the qualification differs in substance: on a
 * standard-based row the point is that the STANDARD does not contain the
 * figure. The two FSER reg 7 rows carry no suffix — reg 7 states no permitted
 * maximum at all, which their `sourceIntervalWords` already says.
 */
const TOLERANCE_NOTE = {
  standard: ' — OUR arithmetic on that period, not a figure the standard contains',
};

/** Where the ceiling is internal and a statutory period sits above it. */
const CEILING_NOTE =
  ' — internal only. The deadline is the statutory period above, calculated as a '
  + 'calendar period; do not copy this figure into a procedure or a contract as if '
  + 'it were the legal limit';

/** What an interim row prints while nobody has taken the action on. */
const NOT_ASSIGNED =
  '⛔ **NOT ASSIGNED.** Needs an action id, an owner, the technical authority, '
  + 'a due date, the interim risk owner and a status. Until then this row is not a '
  + 'complete control and must not be relied on as sole assurance.';

const sentenceCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const cell = (label, value) => `| **${label}** | ${value} |`;

/**
 * One entry as its heading, description and table.
 * @param {Object} e
 * @returns {string}
 */
export function renderEntry(e) {
  const rows = [];
  const add = (label, value) => { if (value) rows.push(cell(label, value)); };

  add('Reference', e.statutoryRef);
  add('Why we hold it', BASIS_LABEL[e.basis] ?? e.basis);
  // ⛔ An assurance-only row says so HERE, in the two lines everyone reads,
  // rather than only in a note underneath.
  add('What makes it fall due',
    e.assuranceOnly ? 'Calendar — assurance control only'
      : (TRIGGER_LABEL[triggerTypeOf(e)] ?? triggerTypeOf(e)));
  add('Interval', intervalLabel(e));
  add('Trigger', e.trigger);
  add('Trigger source', e.triggerSource);
  // ⛔ An annual pass over an event-driven duty says so IN THE TABLE, naming
  // the control that actually discharges it. A reader skimming the two lines
  // everyone reads could otherwise take the statutory process to be checked
  // annually — which is the conflation the two rows were split to prevent.
  add('⚠ Does NOT discharge', e.assuranceOnly
    && `This row does not discharge or replace the statutory duty. `
     + `The operative control is ${e.assuranceOnly}.`);
  add('Where the interval comes from', intervalSourceLabel(e));

  // The ceiling, and whose it is. ⛔ The two pairs are mutually exclusive:
  // where the source states a period in words that period is quoted and the day
  // figure is OURS; where it does not, the ceiling is an internal one.
  if (e.maxIntervalDays) {
    if (e.sourceIntervalWords) {
      // ⚠ A statutory period opens a sentence and is capitalised; a standard's
      // is quoted mid-phrase and is not. Stored lowercase either way, because
      // the register holds the source's words and the document presents them.
      add(e.basis === 'statute' ? 'Statutory interval' : 'Interval specified by the reference',
        e.basis === 'statute' ? sentenceCase(e.sourceIntervalWords) : e.sourceIntervalWords);
    }
    // ⛔ THE DAY FIGURE ALWAYS SAYS WHOSE IT IS. No instrument anywhere states
    // 366 days, or 92, or 183 — those are our arithmetic on a calendar word,
    // and printing one unqualified under a statutory heading is this document's
    // own central error turned inwards.
    add(...(e.maxIsSchedulingTolerance
      ? ['Our scheduling tolerance', `${e.maxIntervalDays} days${TOLERANCE_NOTE[e.basis] ?? ''}`]
      : ['Internal scheduling ceiling', `${e.maxIntervalDays} days${CEILING_NOTE}`]));
  }

  add('Statutory dutyholder', e.statutoryDutyHolder);
  add('Operationally responsible', e.responsibleParty);
  add('Competence required', e.competencyRequired);
  add('Evidence kept', e.evidenceRequired);
  add('Retention', retentionLabel(e.retentionPeriodMonths));
  add('Retention basis', e.retentionBasis);
  add('Applies when', e.appliesWhen);
  // ⛔ Round 6: "the warning itself can become permanent". An UNASSIGNED action
  // is conspicuous on every reading; a paragraph is not. The full sentence is
  // printed rather than the words "NOT ASSIGNED" alone, because what is missing
  // is six specific things and naming them is what makes it actionable.
  add('Completion action', e.operationallyIncomplete
    ? (e.completionAction || NOT_ASSIGNED)
    : null);
  // ⚠ `reviewerNote` is the ONLY internal field this document may print.
  // "Declare, don't scrape" — scraping `handlingNote` once leaked "no home in
  // the portal" into a document meant for an outsider.
  add('Note', e.reviewerNote);

  return [
    `#### ${e.name}`,
    '',
    e.description,
    '',
    '| | |',
    '|---|---|',
    ...rows,
  ].join('\n');
}

/**
 * The whole of §6, grouped as the document groups it.
 * @param {Object[]} entries      in register order
 * @param {{groups: string[], groupLabel: Record<string,string>}} vocab
 * @returns {string}
 */
export function renderSection6(entries, vocab) {
  const { groups, groupLabel } = vocab;
  const live = entries.filter(e => !e.supersededOn);
  const out = [`## 6. The register (${live.length})`, ''];

  for (const group of groups) {
    const rows = live.filter(e => e.group === group);
    if (rows.length === 0) continue;
    out.push(`### ${groupLabel[group]} (${rows.length})`, '');
    for (const e of rows) out.push(renderEntry(e), '');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
