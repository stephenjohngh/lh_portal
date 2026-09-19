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
 * What a row says about its own origin — and it says nothing at all unless
 * there is something to say.
 *
 * ⛔ THE REQUIREMENT IS THE BUILD PLAN'S §4.2: "a document that presents a
 * locally-added, unverified requirement identically to a verified one is the
 * 'reads plausibly while saying something untrue' failure, applied to the one
 * artefact that goes outside the building."
 *
 * ⚠ AND THE SILENCE IS LOAD-BEARING TOO. A register that is purely the shipped
 * seed must render EXACTLY as the reviewed document does, or
 * `check:statement-render` stops being able to tell a real divergence from this
 * line being added to every row. So an unmodified seeded entry returns null and
 * prints no Provenance row at all.
 *
 * @param {{origin?: string, seedModifiedAt?: string|null} | undefined} p
 * @returns {string | null}
 */
function provenanceNote(p) {
  if (!p) return null;
  if (p.origin === 'local') {
    return '⛔ **ADDED HERE — not part of the standard register.** This requirement was '
      + 'entered in this building’s own register rather than shipped with the system, so '
      + 'it has not been through the citation checking the standard entries have had. Read '
      + 'it as a claim made here, and check the reference before relying on it.';
  }
  if (p.seedModifiedAt) {
    return '⚠ **EDITED HERE.** This row began as a standard register entry and has since '
      + 'been changed in this building’s register, so it no longer necessarily matches '
      + 'the version that shipped. What differs can be compared against the standard '
      + 'register in the system.';
  }
  return null;
}

/**
 * One entry as its heading, description and table.
 * @param {Object} e
 * @param {{origin?: string, seedModifiedAt?: string|null}} [provenance]
 * @returns {string}
 */
export function renderEntry(e, provenance) {
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
  // ⛔ LAST, and only when there is something to say — see `provenanceNote`.
  add('Provenance', provenanceNote(provenance));

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
 * The groups, in the order §6 prints them, and the headings it prints.
 *
 * ⚠ DELIBERATELY NOT `GROUP_LABEL` FROM `statutoryTemplate.js`. Two of the five
 * differ, and both differences were settled in review: the app says "Building
 * Safety Act cycles" where the document says "Building Safety Act duties,
 * triggers and assurance controls", because the section has carried
 * event-driven rows since round 4 and "cycles" contradicted the document's own
 * central distinction; and the app says "Governance and review" where the
 * document says "Governance and assurance". Importing the app's labels would
 * silently rewrite two reviewed headings the next time a screen label improved.
 *
 * ⛔ It is also not a parameter any more. Passing the vocabulary in is an open
 * invitation to pass the app's, which is the fault this comment exists about.
 */
const SECTION_GROUPS = [
  ['fire_safety', 'Statutory fire safety'],
  ['other_statutory', 'Other statutory checks'],
  ['bsa_cycle', 'Building Safety Act duties, triggers and assurance controls'],
  ['building_specific', 'Conditional and interim measures'],
  ['governance', 'Governance and assurance'],
];

/**
 * The whole of §6, grouped as the document groups it.
 *
 * ⛔ THIS THROWS RATHER THAN DROPPING A ROW, and that is the entire reason the
 * assertion is here. The worst fault this register has produced was exactly
 * this shape: the statement grouped on `building_own` while the data said
 * `building_specific`, nothing errored, and NINE ENTRIES were absent from every
 * version of the document ever produced — including the copy an external
 * reviewer assessed. Several were interim mitigations against open structural
 * and fire-alarm findings. A `filter` that matches nothing looks exactly like a
 * group that is empty.
 *
 * @param {Object[]} entries                 the register, in register order
 * @param {Record<string, {origin?: string, seedModifiedAt?: string|null}>} [provenance]
 *        keyed by `key`; omit for a register that is purely the shipped seed
 * @returns {string}
 */
export function renderSection6(entries, provenance = {}) {
  const live = entries.filter(e => !e.supersededOn);
  const known = new Set(SECTION_GROUPS.map(([g]) => g));

  const orphaned = live.filter(e => !known.has(e.group));
  if (orphaned.length) {
    throw new Error(
      `§6 cannot be rendered: ${orphaned.length} entr${orphaned.length === 1 ? 'y belongs' : 'ies belong'} `
      + `to no printed group, and would be silently absent from the document — `
      + orphaned.map(e => `${e.key} (group "${e.group}")`).join(', '),
    );
  }

  const out = [`## 6. The register (${live.length})`, ''];
  let printed = 0;
  for (const [group, heading] of SECTION_GROUPS) {
    const rows = live.filter(e => e.group === group);
    if (rows.length === 0) continue;
    out.push(`### ${heading} (${rows.length})`, '');
    for (const e of rows) { out.push(renderEntry(e, provenance[e.key]), ''); printed++; }
  }

  // ⚠ Belt and braces over the same fault. The group check above is the one
  // that catches a renamed group; this catches anything else that could lose a
  // row between the filter and the page.
  if (printed !== live.length) {
    throw new Error(`§6 printed ${printed} of ${live.length} applicable entries`);
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
/**
 * §6 as a file somebody can put into the statement.
 *
 * ⭐ R4's deliverable. The statement is hand-maintained markdown that lives in
 * `docs/` — which is gitignored and does NOT ship, so today producing it needs
 * one particular laptop. This is the half of that problem the register can
 * solve on its own: §6 is 2,348 of the document's 2,895 lines, and it is the
 * only part that is data rather than prose.
 *
 * ⛔ THE BANNER IS NOT DECORATION. Three things about a generated section are
 * invisible once the file is in somebody's inbox, and each of them changes what
 * the reader should conclude: WHEN it was generated, WHETHER it came from this
 * building's register or from the shipped standard one, and HOW MANY rows in it
 * were added or changed here. It is an HTML comment so that it survives being
 * pasted into the statement without appearing in the rendered document — and so
 * that removing it is a deliberate act rather than a tidy-up.
 *
 * ⚠ It carries a generated-at date and NO revision number, by a decision taken
 * on 2026-09-17: a revision number carried information only while revisions
 * arrived several a day, and once a review is rare it distinguishes nothing
 * while implying a history the document does not tell.
 *
 * @param {Object} payload
 * @param {Object[]} payload.entries          the WHOLE register, never a filtered subset
 * @param {Record<string, {origin?: string, seedModifiedAt?: string|null}>} [payload.provenance]
 * @param {string} payload.generatedAt        already formatted en-GB by the caller
 * @param {string} [payload.building]
 * @param {'database'|'seed'} [payload.source]
 * @returns {string}
 */
export function buildStatementSection6(payload) {
  const {
    entries, provenance = {}, generatedAt,
    building = 'Lancaster House', source = 'database',
  } = payload ?? {};

  // ⛔ An empty §6 renders as "this building has no periodic obligations",
  // which is the most dangerous sentence this system could produce. Refuse.
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('§6 cannot be generated from an empty register');
  }

  const section = renderSection6(entries, provenance);
  const live = entries.filter(e => !e.supersededOn);
  const local = live.filter(e => provenance[e.key]?.origin === 'local').length;
  const edited = live.filter(e => provenance[e.key]?.origin !== 'local'
    && provenance[e.key]?.seedModifiedAt).length;

  const sourceLines = source === 'database'
    ? [`Source:      this building’s register, held in the system (${live.length} entries)`]
    : [
      'Source:      ⛔ THE SHIPPED STANDARD REGISTER — NOT this building’s own.',
      '             The register held in the system was empty or could not be read',
      `             when this was generated, so what follows is the standard`,
      '             catalogue of requirements rather than what this building has',
      '             recorded. Do not send it as the building’s position.',
    ];

  const counts = local === 0 && edited === 0
    ? ['Local edits: none — every row is the standard register’s, unmodified']
    : [
      `Added here:  ${local}`,
      `Edited here: ${edited}`,
      '             Both are marked on the row itself, under Provenance.',
    ];

  return [
    '<!--',
    'Periodic Obligations Statement — §6, generated from the register.',
    '',
    `Building:    ${building}`,
    `Generated:   ${generatedAt}`,
    ...sourceLines,
    ...counts,
    '',
    'Replace §6 of the statement with everything below this comment. §1–§5 and',
    '§7–§8 are prose, are not generated, and are unaffected.',
    '-->',
    '',
    section.replace(/\n+$/, ''),
    '',
  ].join('\n');
}
