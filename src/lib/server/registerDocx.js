// src/lib/server/registerDocx.js
//
// The register as a Word document — which, with nothing filtered out, IS the
// obligations statement.
//
// ⭐ THERE USED TO BE TWO DOCUMENTS AND THE USER WAS RIGHT THAT THERE SHOULD BE
// ONE. Their words: *"i would like a word doc with no filters and the section
// options on to be this"* — and that is exactly what the statement is. An
// extract is the same document with a filter applied or a section left out.
//
//   no filter · every section  →  the obligations statement
//   anything else              →  an extract of it
//
// ⛔ AND THAT DELETES A WARNING RATHER THAN REWORDING IT. Every extract used to
// print, in red, "this is an extract, not the obligations statement" — a caution
// that existed ONLY because there were two overlapping documents to confuse.
// With one, the document says what it is from what it contains, and a reader
// never has to hold two names in their head.
//
// ⚠ The caution is not gone, it is earned: a document that IS missing rows says
// so, because that is when a reader could be misled.
//
// ⚠ It lives here rather than in the route because a `+server.js` may only
// export HTTP verbs, so a builder inside one could never be unit-tested — and
// document generation is exactly the kind of code that fails at runtime on
// something static analysis cannot see. Same reasoning as `complianceDocx.js`.

import {
  Document, Packer, Table, TableRow, WidthType, TableLayoutType, AlignmentType,
  HeadingLevel,
} from 'docx';
import {
  CONTENT_W_L, BORDERS, COLOURS, DOC_STYLES,
  run, para, hCell, dCell, makeHeader, makeFooter, pageProps,
} from './docxHelpers.js';
import { inlineRuns } from './markdownDocx.js';

const BASIS_LABEL = {
  statute:    'Legislation',
  standard:   'Standard / code',
  contract:   'Contract or scheme',
  management: 'Management decision',
};

const EVIDENCE_LABEL = {
  inspection:      'Inspection walk',
  maintenance_job: 'Contractor job',
};

/**
 * ⚠ Column widths must sum to the landscape content width or Word silently
 * reflows the table. A test asserts the arithmetic rather than trusting it.
 *
 * SEVEN columns carrying NINE fields. The reference and the applies-when
 * condition ride under the requirement name rather than taking two more
 * columns — the same choice the compliance report made, for the same reason:
 * on paper the page is already wide, and a column of prose squeezed to 1,200
 * DXA is unreadable.
 */
export const EXTRACT_COLS = [4600, 1300, 1900, 2200, 1800, 2300, 1298];

/** A cadence in words, with where the interval comes from. */
export function cadenceText(entry) {
  const days = entry?.frequencyDays;
  if (!days) return 'On event — no fixed cycle';
  const period =
    days % 365 === 0 ? `${days / 365 === 1 ? 'Annual' : `Every ${days / 365} years`}` :
    days === 182 || days === 183 ? 'Six-monthly' :
    days === 84 || days === 90 || days === 91 || days === 92 ? 'Quarterly' :
    days === 30 || days === 31 ? 'Monthly' :
    days === 7 ? 'Weekly' :
    days === 1 ? 'Daily' :
    `Every ${days} days`;
  // ⚠ "Stated in the reference" is NOT the same claim as "we chose this", and
  // the register spent five review rounds separating them. A document that
  // printed only the period would lose the distinction entirely.
  const basis = entry?.intervalBasis === 'stated'
    ? 'stated in the reference'
    : 'established practice';
  return `${period}\n(${basis})`;
}

/**
 * Is this the whole picture, or a slice of it?
 *
 * ⭐ THE ONLY THING THAT DECIDES WHAT THIS DOCUMENT IS. Nothing is passed in
 * saying "make me a statement" — a caller that could ask for the statement while
 * handing over a filtered set is a caller that can produce a document whose
 * title contradicts its contents, and that is precisely the confusion two
 * documents used to create.
 *
 * @param {{shown: number, total: number, sections: Record<string, boolean>}} p
 */
export function isWholePicture({ shown, total, sections }) {
  return shown === total && SECTION_KEYS.every(k => sections?.[k]);
}

/** The optional sections, in the order a reader needs them. */
export const SECTIONS = [
  { key: 'caveats',  heading: 'What this list does not claim',
    lead: 'Stated plainly, because a statement of intent read as a statement of performance '
        + 'would be the most damaging way for this document to be wrong.' },
  { key: 'absences', heading: 'Duties deliberately not in this list',
    lead: 'Each of these is a duty a reader might expect to find, and the reason it is absent.' },
  { key: 'actions',  heading: 'What is outstanding',
    lead: 'Decisions and determinations that are not yet made. Owner, technical authority and '
        + 'due date are deliberately empty — filling them with plausible names would defeat '
        + 'the purpose, and a blank is conspicuous every time this document is produced.' },
];

export const SECTION_KEYS = SECTIONS.map(s => s.key);

/**
 * ⛔ THE BANNER FOR A DOCUMENT THAT IS NOT THIS BUILDING'S POSITION.
 *
 * Every read path falls back to the register that SHIPS — empty table, failed
 * query, no network — and that fallback is load-bearing rather than defensive:
 * a compliance SCREEN rendering "no requirements" is the most dangerous thing it
 * could say, so showing the standard catalogue is right.
 *
 * ⛔ A DOCUMENT IS THE OPPOSITE CASE. It leaves the building. Titled *statement
 * of periodic safety obligations*, filed as `Obligations_Statement_<date>.docx`
 * and assembled entirely from the shipped catalogue, it describes a higher-risk
 * building IN GENERAL while reading as a description of this one — and the
 * reader has no way to tell.
 *
 * ⚠ THIS EXISTED AND WAS LOST. It lived in `statementDocx.js` and went with the
 * prose machinery when the statement stopped being a separate document. For a
 * day the panel promised *"the file will say so"* and the file said nothing.
 *
 * ⚠ Silent when the register IS this building's own. A banner printed on every
 * copy stops being read, which is the one thing a warning cannot afford — the
 * same argument as the per-row provenance line.
 */
export function fallbackBanner(fromSeed) {
  if (!fromSeed) return [];
  return [
    para([
      run('⛔ THIS COPY IS NOT THIS BUILDING’S POSITION — DO NOT SEND IT. ',
        { bold: true, color: COLOURS.failRed }),
      run(
        'The register could not be read from this building’s records, so this document was built '
        + 'from the standard catalogue that ships with the application. That catalogue describes a '
        + 'higher-risk residential building in general; it says nothing about which duties apply '
        + 'here, what has been decided, or what discharges them. Reload the page and produce it '
        + 'again.',
      ),
    ], { after: 240 }),
  ];
}

export function documentPreamble({ filterSummary, shown, total, sections, building, fromSeed }) {
  const whole = isWholePicture({ shown, total, sections });
  const missing = SECTIONS.filter(s => !sections?.[s.key]).map(s => s.heading.toLowerCase());

  const head = whole
    ? [
      para(`${building} — statement of periodic safety obligations`,
        { heading: HeadingLevel.HEADING_1 }),
      para(
        'Every periodic duty identified for this building, what discharges each one, what is '
        + 'deliberately not here, and what remains outstanding. It is the position as at the '
        + 'date in the header above.',
        { after: 240 },
      ),
    ]
    : [
      para(`${building} — periodic register extract`, { heading: HeadingLevel.HEADING_1 }),
      para([
        run('This is an extract. ', { bold: true, color: COLOURS.failRed }),
        run(
          shown !== total
            ? `It shows ${shown} of ${total} requirements, selected on screen when it was `
              + 'produced. '
            : 'It covers every requirement, but ',
        ),
        run(missing.length
          ? `It omits ${missing.join(', ')}. `
          : ''),
        run(
          'Produce it with no filter and every section included and it is the building’s full '
          + 'statement of its periodic obligations.',
        ),
      ], { after: 160 }),
    ];

  return [
    // ⚠ FIRST, above even the title. A reader who opens the file and reads one
    // line should read this one; a warning under the heading reads as a footnote
    // to it, and this is more important than what the document is called.
    ...fallbackBanner(fromSeed),
    ...head,
    para([
      run('Covering: ', { bold: true }),
      run(shown === total
        ? `all ${total} requirements in the register.`
        : `${shown} of ${total} requirements.`),
      run('   Filter: ', { bold: true }),
      run(filterSummary || 'None — every row'),
    ], { after: 240 }),
  ];
}

/** The table itself. */
export function extractTable(rows) {
  const W = EXTRACT_COLS;
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Compliance obligation', W[0]), hCell('Source', W[1]), hCell('Cadence', W[2]),
      hCell('Duty holder in law', W[3]), hCell('Performed by', W[4]),
      hCell('Evidence required', W[5]), hCell('Status here', W[6]),
    ],
  });

  const body = (rows ?? []).map(({ entry, statusLabel }, i) => {
    // Reference and applies-when ride under the name — see EXTRACT_COLS.
    const nameLines = [entry.name];
    if (entry.statutoryRef) nameLines.push(entry.statutoryRef);
    if (entry.appliesWhen) nameLines.push(`Applies when: ${entry.appliesWhen}`);
    // ⛔ An operationally-incomplete row prints its marker under the NAME, not
    // in the status cell — a reader scanning the status column is exactly the
    // reader who would miss it there. The same argument the compliance report
    // makes for assurance-only rows.
    if (entry.operationallyIncomplete) {
      nameLines.push(
        'OPERATIONALLY INCOMPLETE — an interim measure against an open finding. '
        + `Completion action: ${entry.completionAction || 'NOT ASSIGNED'}`,
      );
    }

    return new TableRow({
      children: [
        dCell(nameLines.join('\n'), W[0], { alt: i % 2 === 1 }),
        dCell(BASIS_LABEL[entry.basis] ?? entry.basis ?? '—', W[1], { alt: i % 2 === 1 }),
        dCell(cadenceText(entry), W[2], { alt: i % 2 === 1 }),
        dCell(entry.statutoryDutyHolder ?? 'No statutory duty holder', W[3], { alt: i % 2 === 1 }),
        dCell(entry.responsibleParty ?? '—', W[4], { alt: i % 2 === 1 }),
        dCell(entry.evidenceRequired ?? '—', W[5], { alt: i % 2 === 1 }),
        dCell(statusLabel ?? '—', W[6], { alt: i % 2 === 1 }),
      ],
    });
  });

  return new Table({
    width: { size: CONTENT_W_L, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    // ⛔ `columnWidths` IS WHAT PRODUCES THE `<w:tblGrid>`, and the renderer
    // sizes columns from the GRID — not from each cell's `w:tcW`. Without it
    // the library emits a placeholder grid of 100 DXA per column, and
    // EXTRACT_COLS above is ignored entirely: every extract produced before
    // 2026-09-19 had seven equal columns. See `tableGridGuard.test.js`.
    columnWidths: EXTRACT_COLS,
    borders: BORDERS,
    rows: [header, ...body],
  });
}

/**
 * @param {Object} [input]
 * @param {{entry: Object, statusLabel?: string}[]} [input.rows]
 * @param {number} [input.total]          the whole register, for "N of M"
 * @param {string} [input.filterSummary]
 * @param {string} [input.generatedAt]
 * @param {string} [input.building]
 * @returns {Document}
 */
/**
 * One of the narrative sections — caveats, reasoned absences, outstanding
 * actions — as blocks.
 *
 * ⭐ THESE WERE 550 LINES OF PROSE and are now rows, which is why this is
 * fifteen lines rather than a document to maintain. An action's owner and due
 * date print as blanks because they ARE blanks; a paragraph could not have
 * shown that without somebody remembering to write it.
 *
 * @param {{key: string, heading: string, lead: string}} section
 * @param {Object[]} items  rows of that kind, already ordered
 */
export function narrativeSection(section, items) {
  if (!items?.length) return [];
  const blocks = [
    para(section.heading, { heading: HeadingLevel.HEADING_2, before: 360 }),
    para(section.lead, { italics: true, color: COLOURS.textMuted, after: 200 }),
  ];

  for (const item of items) {
    blocks.push(para(inlineRuns(item.name, { bold: true }), { before: 160 }));
    if (item.description) blocks.push(para(inlineRuns(item.description)));
    if (item.consequence) {
      blocks.push(para([
        run('If it is not: ', { bold: true, color: COLOURS.textMuted }),
        ...inlineRuns(item.consequence),
      ]));
    }
    if (item.unblocks) {
      blocks.push(para([
        run('Unblocks: ', { bold: true, color: COLOURS.textMuted }),
        ...inlineRuns(item.unblocks),
      ]));
    }
    // ⚠ Printed even when empty, and that is the point — see the section lead.
    if (section.key === 'actions') {
      blocks.push(para([
        run('Owner: ', { bold: true, color: COLOURS.textMuted }),
        run(item.owner || 'NOT ASSIGNED', item.owner ? {} : { color: COLOURS.failRed }),
        run('   Technical authority: ', { bold: true, color: COLOURS.textMuted }),
        run(item.technicalAuthority || 'NOT ASSIGNED',
          item.technicalAuthority ? {} : { color: COLOURS.failRed }),
        run('   Due: ', { bold: true, color: COLOURS.textMuted }),
        run(item.dueDate || 'NOT ASSIGNED', item.dueDate ? {} : { color: COLOURS.failRed }),
      ], { size: 16 }));
    }
  }
  return blocks;
}

/**
 * The document. With nothing filtered and every section on, this IS the
 * obligations statement — see the file header.
 *
 * @param {{
 *   rows?: Object[], total?: number, filterSummary?: string, generatedAt?: string,
 *   building?: string,
 *   sections?: Record<string, boolean>,
 *   items?: {caveats?: Object[], absences?: Object[], actions?: Object[]},
 * }} input
 */
export function buildRegisterDocument(input = {}) {
  const {
    rows = [], total = 0, filterSummary = '', generatedAt = '',
    building = 'Lancaster House',
    sections = {}, items = {},
    // ⚠ Defaults to FALSE, which is the safe direction only because the caller
    // always knows. A missing flag prints no banner; a wrong TRUE prints one
    // that is merely annoying. Getting it wrong the other way is the fault this
    // exists to prevent, so the panel passes it explicitly rather than relying
    // on this default.
    fromSeed = false,
  } = input;

  const whole = isWholePicture({ shown: rows.length, total, sections });

  const children = [
    ...documentPreamble({ filterSummary, shown: rows.length, total, sections, building, fromSeed }),
  ];

  // ⚠ The caveats come BEFORE the table on purpose. They set what the list does
  // and does not assert, and a reader who meets them afterwards has already
  // formed a view.
  if (sections.caveats) children.push(...narrativeSection(SECTIONS[0], items.caveats ?? []));

  children.push(
    para('The register', { heading: HeadingLevel.HEADING_2, before: 360 }),
    rows.length
      ? extractTable(rows)
      : para('Nothing matched the filter, so this document has no requirements in it.',
        { italics: true }),
    para(
      'Evidence routes: '
      + Object.values(EVIDENCE_LABEL).join(' · ')
      + '. A requirement with neither is not schedulable in this portal.',
      { before: 200, size: 16, color: COLOURS.textMuted },
    ),
  );

  if (sections.absences) children.push(...narrativeSection(SECTIONS[1], items.absences ?? []));
  if (sections.actions) children.push(...narrativeSection(SECTIONS[2], items.actions ?? []));

  return new Document({
    styles: DOC_STYLES,
    sections: [{
      // ⚠ pageProps swaps the dimensions for landscape itself — passing the
      // already-swapped values would double-swap back to portrait.
      properties: pageProps({ landscape: true }),
      headers: {
        default: makeHeader(
          `${building} — ${whole ? 'obligations statement' : 'register extract'}`,
          generatedAt, CONTENT_W_L),
      },
      footers: { default: makeFooter() },
      children,
    }],
  });
}

export { Packer, CONTENT_W_L, AlignmentType };
