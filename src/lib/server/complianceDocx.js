// src/lib/server/complianceDocx.js
// Document builders for the periodic compliance report.
//
// These live here rather than in the route because a `+server.js` may only
// export HTTP verbs — anything else passes `npm run check` and FAILS the build.
// That rule also made them untestable, which mattered: document generation
// fails at runtime on things static analysis cannot see (a null in a cell, a
// column-width sum that does not match the page). Out here they are ordinary
// functions with an ordinary test.
//
// They RE-DERIVE NOTHING. Rows arrive pre-filtered and pre-sorted from the
// screen that asked for them, so the document can never disagree with the
// report the user was looking at when they pressed the button. `options` only
// ever NARROWS what prints — it can never add a row the screen did not show.

import {
  Document, Packer, Paragraph,
  Table, TableRow, HeadingLevel, WidthType, TableLayoutType, PageBreak, AlignmentType,
} from 'docx';
import {
  CONTENT_W_L, PAGE_W_L, PAGE_H_L, COLOURS, BORDERS,
  hCell, dCell, run, para,
  makeHeader, makeFooter, DOC_STYLES, pageProps,
} from './docxHelpers.js';

const STATUS_COLOUR = {
  breach:    COLOURS.failRed,
  gap:       COLOURS.warnAmber,
  attention: COLOURS.warnAmber,
  ok:        COLOURS.passGreen,
  // ⛔ NOT passGreen. An assurance control on schedule is not the duty met.
  assured:   '7C3AED',
  elsewhere: '3B82F6',
  unhomed:   COLOURS.failRed,
  excluded:   '9CA3AF',
  superseded: '6B7280',
  retired:    '6B7280',
};

const STATUS_LABEL = {
  breach: 'In breach', gap: 'Not scheduled', attention: 'Needs attention',
  ok: 'On schedule', assured: 'Assurance confirmed — NOT the statutory duty',
  elsewhere: 'Tracked in another app',
  unhomed: 'Nothing deals with it', excluded: 'Recorded as not applicable',
  superseded: 'No longer required', retired: 'Retired',
};

const BASIS_LABEL = {
  statute: 'Legislation', standard: 'Standard / code',
  contract: 'Contract or scheme', management: 'Management decision',
};

const GROUP_LABEL = {
  fire_safety: 'Statutory fire safety',
  other_statutory: 'Other statutory checks',
  bsa_cycle: 'Building Safety Act cycles',
  building_specific: 'This building’s own cycles',
  governance: 'Governance and review',
  unlisted: 'Not in the register',
};

// Server code cannot import the client date helpers (they reach for $app), and
// the project rule is en-GB everywhere — never toLocaleDateString('en-US').
export function d(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Column widths must each sum to the landscape content width, or Word silently
// reflows the table. A test asserts these rather than trusting the arithmetic.
export const POSITION_COLS  = [4200, 1700, 1400, 1500, 3200, 1500, 1898];
export const HISTORY_COLS   = [1900, 4400, 4400, 2200, 2498];
export const EXCLUSION_COLS = [5000, 2000, 6398, 2000];

export function summarySection(summary, total) {
  const order = ['breach', 'gap', 'attention', 'ok', 'elsewhere', 'unhomed', 'excluded', 'superseded', 'retired'];
  const present = order.filter(k => (summary?.[k] ?? 0) > 0);
  if (present.length === 0) return para([run(`${total} requirements.`)]);
  const w = Math.floor(CONTENT_W_L / present.length);

  return new Table({
    width: { size: CONTENT_W_L, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    // ⚠ Equal columns here are deliberate — one per status present — but
    // the grid still has to SAY so, or the renderer invents its own.
    columnWidths: present.map(() => w),
    borders: BORDERS,
    rows: [
      new TableRow({ children: present.map(k => hCell(STATUS_LABEL[k], w)) }),
      new TableRow({
        children: present.map(k => dCell(String(summary[k]), w, {
          bold: true, color: STATUS_COLOUR[k], align: AlignmentType.CENTER,
        })),
      }),
    ],
  });
}

export function positionTable(rows) {
  const W = POSITION_COLS;
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Requirement', W[0]), hCell('Source', W[1]), hCell('Cadence', W[2]),
      hCell('Last completed', W[3]), hCell('Last attempted', W[4]),
      hCell('Next due', W[5]), hCell('Status', W[6]),
    ],
  });

  const body = (rows ?? []).map(r => {
    // The reference and the owner ride under the name rather than taking two
    // more columns — on paper the page is already seven columns wide.
    const nameLines = [r.name];
    if (r.statutoryRef) nameLines.push(r.statutoryRef);
    if (r.owner) nameLines.push(r.owner);
    // ⛔ An assurance-only row prints its caveat, and prints it under the NAME
    // rather than in the status cell — a reader scanning the status column for
    // red is exactly the reader who would miss it there.
    if (r.assuranceOnly) {
      nameLines.push(`Assurance control only — does NOT discharge the statutory duty. The operative control is ${r.assuranceOnly}`);
    }
    if (r.exclusionReason) {
      nameLines.push(`Not applicable — “${r.exclusionReason}” (${d(r.exclusionDecidedAt)})`);
      if (r.exclusionReviewDue) nameLines.push(`Review this decision ${d(r.exclusionReviewDue)}`);
    }
    // A withdrawn requirement still prints, with what withdrew it. Work done
    // under it before that date is still evidence and still has to make sense.
    if (r.retiredReason) nameLines.push(r.retiredReason);

    // Two columns, never one: the gap between them is where compliance fails.
    const attempted = r.lastAttempted
      ? [d(r.lastAttempted), r.lastOutcome].filter(Boolean).join(' — ')
      : '—';

    const statusLabel = r.statusLabel ?? STATUS_LABEL[r.status] ?? r.status ?? '—';

    return new TableRow({
      children: [
        dCell(nameLines.join('\n'), W[0]),
        dCell(r.basis ? BASIS_LABEL[r.basis] ?? r.basis : '—', W[1]),
        dCell(r.frequencyLabel ?? '—', W[2]),
        // "Never" in red, not an empty cell: the absence of evidence is the
        // strongest signal in the report and must not read as missing data.
        dCell(r.lastCompleted ? d(r.lastCompleted) : 'Never', W[3],
          r.lastCompleted ? {} : { color: COLOURS.failRed }),
        dCell(attempted, W[4]),
        dCell(r.nextDue ? d(r.nextDue) : '—', W[5]),
        dCell(
          r.intervalBreached ? `${statusLabel} · exceeds max interval` : statusLabel,
          W[6],
          { color: STATUS_COLOUR[r.status] ?? undefined, bold: r.status === 'breach' },
        ),
      ],
    });
  });

  return new Table({
    width: { size: CONTENT_W_L, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    // ⛔ `columnWidths` produces the `<w:tblGrid>`, and the renderer sizes
    // columns from the GRID rather than from each cell's `w:tcW`. Without it
    // the library emits a placeholder grid of 100 DXA per column and POSITION_COLS
    // is ignored entirely — see `tableGridGuard.test.js`.
    columnWidths: POSITION_COLS,
    borders: BORDERS,
    rows: [header, ...body],
  });
}

export function historyTable(history) {
  const W = HISTORY_COLS;
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Date', W[0]), hCell('Requirement', W[1]),
      hCell('Outcome', W[2]), hCell('By', W[3]), hCell('Reference', W[4]),
    ],
  });
  const body = (history ?? []).map(h => new TableRow({
    children: [
      dCell(d(h.at), W[0]),
      dCell([h.obligationName, h.statutoryRef].filter(Boolean).join('\n'), W[1]),
      dCell([h.kind === 'walk' ? 'Inspection' : 'Job', h.outcome].filter(Boolean).join(' — '), W[2]),
      dCell(h.by ?? '—', W[3]),
      dCell([h.reference, h.notes].filter(Boolean).join('\n') || '—', W[4]),
    ],
  }));
  return new Table({
    width: { size: CONTENT_W_L, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    // ⛔ `columnWidths` produces the `<w:tblGrid>`, and the renderer sizes
    // columns from the GRID rather than from each cell's `w:tcW`. Without it
    // the library emits a placeholder grid of 100 DXA per column and HISTORY_COLS
    // is ignored entirely — see `tableGridGuard.test.js`.
    columnWidths: HISTORY_COLS,
    borders: BORDERS,
    rows: [header, ...body],
  });
}

export function exclusionTable(excluded) {
  const W = EXCLUSION_COLS;
  return new Table({
    width: { size: CONTENT_W_L, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    // ⛔ `columnWidths` produces the `<w:tblGrid>`, and the renderer sizes
    // columns from the GRID rather than from each cell's `w:tcW`. Without it
    // the library emits a placeholder grid of 100 DXA per column and EXCLUSION_COLS
    // is ignored entirely — see `tableGridGuard.test.js`.
    columnWidths: EXCLUSION_COLS,
    borders: BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          hCell('Requirement', W[0]), hCell('Source', W[1]),
          hCell('Reason recorded', W[2]), hCell('Decided', W[3]),
        ],
      }),
      ...(excluded ?? []).map(r => new TableRow({
        children: [
          dCell([r.name, r.statutoryRef].filter(Boolean).join('\n'), W[0]),
          dCell(r.basis ? BASIS_LABEL[r.basis] ?? r.basis : '—', W[1]),
          dCell(r.exclusionReason ?? '—', W[2]),
          dCell(
            [d(r.exclusionDecidedAt), r.exclusionReviewDue ? `Review ${d(r.exclusionReviewDue)}` : null]
              .filter(Boolean).join('\n'),
            W[3]),
        ],
      })),
    ],
  });
}

/** Rows that will actually print. `options` narrows; it never adds. */
export function printedRows(rows, options = {}) {
  const inclEx = options.includeExcluded !== false;
  const inclEl = options.includeElsewhere !== false;
  return (rows ?? []).filter(r =>
    (inclEx || r.status !== 'excluded') && (inclEl || r.status !== 'elsewhere'));
}

/**
 * The whole document. Returns a docx `Document`; the caller packs it.
 * @param {object} [input]
 */
export function buildComplianceDocument(input = {}) {
  const {
    building = 'Building', generatedAt = '',
    rows = [], history = [], historyWindow = {}, summary = {}, options = {},
  } = input ?? {};

  const opts = {
    includeExcluded: options.includeExcluded !== false,
    includeElsewhere: options.includeElsewhere !== false,
    includeHistory: Boolean(options.includeHistory),
    notes: options.notes ?? '',
    walkEvidenceNote: options.walkEvidenceNote ?? '',
  };

  const printed  = printedRows(rows, options);
  const excluded = (rows ?? []).filter(r => r.status === 'excluded');

  const children = [
    new Paragraph({ text: 'Periodic compliance position', heading: HeadingLevel.HEADING_1 }),
    para([run(building, { bold: true }), run(`   ·   As at ${generatedAt}`, { color: COLOURS.textMuted })]),
    new Paragraph({ text: '' }),
  ];

  if (opts.notes) {
    children.push(para([run(opts.notes, { italics: true })]), new Paragraph({ text: '' }));
  }

  // An honest report says what it could not see. This is the same sentence the
  // screen shows, so a document produced without Inspection evidence can never
  // be mistaken for a complete one.
  if (opts.walkEvidenceNote) {
    children.push(
      para([run(`Note: ${opts.walkEvidenceNote}`, { color: COLOURS.warnAmber })]),
      new Paragraph({ text: '' }),
    );
  }

  children.push(
    summarySection(summary, (rows ?? []).length),
    new Paragraph({ text: '' }),
    para([run(
      `${printed.length} requirement${printed.length === 1 ? '' : 's'}, in the order shown on screen. `
      + 'Requirements with no recorded completion are shown as “Never” rather than left blank.',
      { color: COLOURS.textMuted, size: 18 },
    )]),
    new Paragraph({ text: '' }),
  );

  // Grouped by category, keeping the order the rows arrived in — the screen
  // already decided that order and the document must not second-guess it.
  const groups = [];
  for (const r of printed) {
    const g = groups.find(x => x.key === r.group);
    if (g) g.rows.push(r);
    else groups.push({ key: r.group, rows: [r] });
  }

  for (const g of groups) {
    children.push(
      new Paragraph({ text: GROUP_LABEL[g.key] ?? g.key, heading: HeadingLevel.HEADING_2 }),
      positionTable(g.rows),
      new Paragraph({ text: '' }),
    );
  }

  // The exclusions, restated together — the section an assessor turns to first,
  // and the reason the decision record exists at all.
  if (opts.includeExcluded && excluded.length > 0) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ text: 'Recorded as not applicable', heading: HeadingLevel.HEADING_2 }),
      para([run(
        'Each of these is a requirement this building has decided does not apply to it. '
        + 'The decision, its reason and its date are recorded and reversible.',
        { color: COLOURS.textMuted, size: 18 },
      )]),
      new Paragraph({ text: '' }),
      exclusionTable(excluded),
      new Paragraph({ text: '' }),
    );
  }

  if (opts.includeHistory && (history ?? []).length > 0) {
    const modeText = historyWindow?.mode === 'due' ? 'due in the period' : 'completed in the period';
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ text: 'Evidence history', heading: HeadingLevel.HEADING_2 }),
      para([run(
        `${history.length} occurrence${history.length === 1 ? '' : 's'} `
        + `${modeText}, ${d(historyWindow?.from)} to ${d(historyWindow?.to)}.`,
        { color: COLOURS.textMuted, size: 18 },
      )]),
      new Paragraph({ text: '' }),
      historyTable(history),
    );
  }

  return new Document({
    styles: DOC_STYLES,
    sections: [{
      // Landscape: seven columns, one of which carries a sentence. The existing
      // landscape reports pass the swapped page dimensions explicitly rather
      // than relying on the orientation flag alone.
      properties: pageProps({ width: PAGE_W_L, height: PAGE_H_L }),
      headers: { default: makeHeader('Periodic compliance position', generatedAt, CONTENT_W_L) },
      footers: { default: makeFooter() },
      children,
    }],
  });
}

export { Packer, CONTENT_W_L };
