// src/lib/server/registerDocx.js
//
// The periodic activity register, as filtered, as a Word document.
//
// ⛔ THIS IS NOT THE OBLIGATIONS STATEMENT, AND THE DOCUMENT SAYS SO ON ITS
// FIRST PAGE. `Periodic_Obligations_Statement.md` is hand-maintained, has been
// through fourteen rounds of external review, and carries a scope statement, a
// status block and the reasoning behind every cadence. This is a table of rows
// somebody filtered on a screen. The two are easy to confuse once a .docx is in
// an inbox, and confusing them would put an unreviewed extract in front of a
// reviewer — so every copy states what it is, what it is not, what it was
// filtered to, and how many of the register it represents.
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
 * The block that stops this being mistaken for the statement.
 * @param {{filterSummary: string, shown: number, total: number}} input
 */
export function extractPreamble({ filterSummary, shown, total }) {
  const filtered = shown !== total;
  return [
    para('Periodic activity register — filtered extract', { heading: HeadingLevel.HEADING_1 }),
    para([
      run('This is an extract, not the obligations statement. ', { bold: true, color: COLOURS.failRed }),
      run(
        'It lists rows selected on screen at the moment it was produced. It carries no scope '
        + 'statement, no account of what remains unverified, and no reasoning for any cadence. '
        + 'Where a formal statement of this building’s periodic obligations is needed, that is '
        + 'a separate, reviewed document and this must not be sent in its place.',
      ),
    ], { after: 160 }),
    para([
      run('Showing: ', { bold: true }),
      run(filtered
        ? `${shown} of ${total} requirements.`
        : `all ${total} requirements in the register.`),
      run('   Filter: ', { bold: true }),
      run(filterSummary || 'No filters — every row'),
    ], { after: 240 }),
  ];
}

/** The table itself. */
export function extractTable(rows) {
  const W = EXTRACT_COLS;
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Requirement', W[0]), hCell('Source', W[1]), hCell('Cadence', W[2]),
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
export function buildRegisterExtract(input = {}) {
  const {
    rows = [], total = 0, filterSummary = '', generatedAt = '',
    building = 'Lancaster House',
  } = input;

  const children = [
    ...extractPreamble({ filterSummary, shown: rows.length, total }),
    rows.length
      ? extractTable(rows)
      : para('Nothing matched the filter, so this extract is empty.', { italics: true }),
    para(
      'Evidence routes: '
      + Object.values(EVIDENCE_LABEL).join(' · ')
      + '. A requirement with neither is not schedulable in this portal.',
      { before: 200, size: 16, color: COLOURS.textMuted },
    ),
  ];

  return new Document({
    styles: DOC_STYLES,
    sections: [{
      // ⚠ pageProps swaps the dimensions for landscape itself — passing the
      // already-swapped values would double-swap back to portrait.
      properties: pageProps({ landscape: true }),
      headers: { default: makeHeader(`${building} — register extract`, generatedAt, CONTENT_W_L) },
      footers: { default: makeFooter() },
      children,
    }],
  });
}

export { Packer, CONTENT_W_L, AlignmentType };
