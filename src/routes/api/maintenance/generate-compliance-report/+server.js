// src/routes/api/maintenance/generate-compliance-report/+server.js
// The periodic compliance position as a Word document.
//
// POST body: { building, generatedAt, report, rows, history, historyWindow,
//              summary, options }
//
// The ROWS ARE SENT PRE-FILTERED AND PRE-SORTED by the screen that asked for
// them. That is deliberate: this route re-derives nothing, so the document can
// never disagree with the report the user was looking at when they pressed the
// button. The only thing `options` changes is which sections print.
//
// Landscape, because the position table has seven columns and the last-attempted
// one carries a sentence.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import {
  Document, Packer, Paragraph,
  Table, TableRow, HeadingLevel, WidthType, TableLayoutType, PageBreak, AlignmentType,
} from 'docx';
import { getLogger } from '$lib/utils/logger';
import {
  CONTENT_W_L, PAGE_W_L, PAGE_H_L, COLOURS, BORDERS,
  hCell, dCell, run, para,
  makeHeader, makeFooter, DOC_STYLES, pageProps,
} from '$lib/server/docxHelpers.js';

const logger = getLogger('maintenance:generate-compliance-report');

const STATUS_COLOUR = {
  breach:    COLOURS.failRed,
  gap:       COLOURS.warnAmber,
  attention: COLOURS.warnAmber,
  ok:        COLOURS.passGreen,
  elsewhere: '3B82F6',
  unhomed:   COLOURS.failRed,
  excluded:  '9CA3AF',
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

// Server routes cannot import $lib client helpers that touch $app, and the
// project rule is en-GB everywhere — never toLocaleDateString('en-US').
function d(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Position table: Requirement | Source | Cadence | Last completed | Last attempted | Next due | Status
const PW = [4200, 1700, 1400, 1500, 3200, 1500, 1898];   // sum = 15398
// History table: Date | Requirement | Outcome | By | Reference
const HW = [1900, 4400, 4400, 2200, 2498];               // sum = 15398

function summarySection(summary, total) {
  const order = ['breach', 'gap', 'attention', 'ok', 'elsewhere', 'unhomed', 'excluded'];
  const label = {
    breach: 'In breach', gap: 'Not scheduled', attention: 'Needs attention',
    ok: 'On schedule', elsewhere: 'Tracked in another app',
    unhomed: 'Nothing deals with it', excluded: 'Recorded as not applicable',
  };
  const present = order.filter(k => (summary?.[k] ?? 0) > 0);
  if (present.length === 0) return para([run(`${total} requirements.`)]);
  const w = Math.floor(CONTENT_W_L / present.length);

  return new Table({
    width: { size: CONTENT_W_L, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: BORDERS,
    rows: [
      new TableRow({ children: present.map(k => hCell(label[k], w)) }),
      new TableRow({
        children: present.map(k => dCell(String(summary[k]), w, {
          bold: true, color: STATUS_COLOUR[k], align: AlignmentType.CENTER,
        })),
      }),
    ],
  });
}

function positionTable(rows) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Requirement', PW[0]), hCell('Source', PW[1]), hCell('Cadence', PW[2]),
      hCell('Last completed', PW[3]), hCell('Last attempted', PW[4]),
      hCell('Next due', PW[5]), hCell('Status', PW[6]),
    ],
  });

  const body = rows.map(r => {
    // The reference and the owner ride under the name rather than taking two
    // more columns — on paper the page is already seven columns wide.
    const nameLines = [r.name];
    if (r.statutoryRef) nameLines.push(r.statutoryRef);
    if (r.owner) nameLines.push(r.owner);
    if (r.exclusionReason) {
      nameLines.push(`Not applicable — “${r.exclusionReason}” (${d(r.exclusionDecidedAt)})`);
      if (r.exclusionReviewDue) nameLines.push(`Review this decision ${d(r.exclusionReviewDue)}`);
    }

    const attempted = r.lastAttempted
      ? [d(r.lastAttempted), r.lastOutcome].filter(Boolean).join(' — ')
      : '—';

    return new TableRow({
      children: [
        dCell(nameLines.join('\n'), PW[0]),
        dCell(r.basis ? BASIS_LABEL[r.basis] ?? r.basis : '—', PW[1]),
        dCell(r.frequencyLabel ?? '—', PW[2]),
        dCell(r.lastCompleted ? d(r.lastCompleted) : 'Never', PW[3],
          r.lastCompleted ? {} : { color: COLOURS.failRed }),
        dCell(attempted, PW[4]),
        dCell(r.nextDue ? d(r.nextDue) : '—', PW[5]),
        dCell(
          r.intervalBreached ? `${r.statusLabel} · exceeds max interval` : r.statusLabel,
          PW[6],
          { color: STATUS_COLOUR[r.status] ?? undefined, bold: r.status === 'breach' },
        ),
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

function historyTable(history) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      hCell('Date', HW[0]), hCell('Requirement', HW[1]),
      hCell('Outcome', HW[2]), hCell('By', HW[3]), hCell('Reference', HW[4]),
    ],
  });
  const body = history.map(h => new TableRow({
    children: [
      dCell(d(h.at), HW[0]),
      dCell([h.obligationName, h.statutoryRef].filter(Boolean).join('\n'), HW[1]),
      dCell([h.kind === 'walk' ? 'Inspection' : 'Job', h.outcome].filter(Boolean).join(' — '), HW[2]),
      dCell(h.by ?? '—', HW[3]),
      dCell([h.reference, h.notes].filter(Boolean).join('\n') || '—', HW[4]),
    ],
  }));
  return new Table({
    width: { size: CONTENT_W_L, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: BORDERS,
    rows: [header, ...body],
  });
}

export async function POST({ request }) {
  const authed = await requireAuth(request);
  if (authed instanceof Response) return authed;

  try {
    const {
      building = 'Building', generatedAt = '',
      rows = [], history = [], historyWindow = {}, summary = {}, options = {},
    } = await request.json();

    const opts = {
      includeExcluded: options.includeExcluded !== false,
      includeElsewhere: options.includeElsewhere !== false,
      includeHistory: Boolean(options.includeHistory),
      notes: options.notes ?? '',
      walkEvidenceNote: options.walkEvidenceNote ?? '',
    };

    // Only ever narrows what was on screen — never adds.
    const printed = rows.filter(r =>
      (opts.includeExcluded || r.status !== 'excluded')
      && (opts.includeElsewhere || r.status !== 'elsewhere'));

    const excluded = rows.filter(r => r.status === 'excluded');

    const children = [
      new Paragraph({ text: 'Periodic compliance position', heading: HeadingLevel.HEADING_1 }),
      para([run(building, { bold: true }), run(`   ·   As at ${generatedAt}`, { color: COLOURS.textMuted })]),
      new Paragraph({ text: '' }),
    ];

    if (opts.notes) {
      children.push(para([run(opts.notes, { italics: true })]), new Paragraph({ text: '' }));
    }

    // An honest report says what it could not see.
    if (opts.walkEvidenceNote) {
      children.push(
        para([run(`Note: ${opts.walkEvidenceNote}`, { color: COLOURS.warnAmber })]),
        new Paragraph({ text: '' }),
      );
    }

    children.push(
      summarySection(summary, rows.length),
      new Paragraph({ text: '' }),
      para([run(
        `${printed.length} requirement${printed.length === 1 ? '' : 's'}, in the order shown on screen. `
        + 'Requirements with no recorded completion are shown as “Never” rather than left blank.',
        { color: COLOURS.textMuted, size: 18 },
      )]),
      new Paragraph({ text: '' }),
    );

    // Grouped by category, keeping the order the rows arrived in.
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

    // The exclusions, restated together — the section an assessor turns to
    // first, and the reason the decision record exists at all.
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
        new Table({
          width: { size: CONTENT_W_L, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          borders: BORDERS,
          rows: [
            new TableRow({
              tableHeader: true,
              children: [hCell('Requirement', 5000), hCell('Source', 2000), hCell('Reason recorded', 6398), hCell('Decided', 2000)],
            }),
            ...excluded.map(r => new TableRow({
              children: [
                dCell([r.name, r.statutoryRef].filter(Boolean).join('\n'), 5000),
                dCell(r.basis ? BASIS_LABEL[r.basis] ?? r.basis : '—', 2000),
                dCell(r.exclusionReason ?? '—', 6398),
                dCell(
                  [d(r.exclusionDecidedAt), r.exclusionReviewDue ? `Review ${d(r.exclusionReviewDue)}` : null]
                    .filter(Boolean).join('\n'),
                  2000),
              ],
            })),
          ],
        }),
        new Paragraph({ text: '' }),
      );
    }

    if (opts.includeHistory && history.length > 0) {
      const modeText = historyWindow.mode === 'due' ? 'due in the period' : 'completed in the period';
      children.push(
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ text: 'Evidence history', heading: HeadingLevel.HEADING_2 }),
        para([run(
          `${history.length} occurrence${history.length === 1 ? '' : 's'} `
          + `${modeText}, ${d(historyWindow.from)} to ${d(historyWindow.to)}.`,
          { color: COLOURS.textMuted, size: 18 },
        )]),
        new Paragraph({ text: '' }),
        historyTable(history),
      );
    }

    const doc = new Document({
      styles: DOC_STYLES,
      sections: [{
        // Landscape: seven columns, one of which carries a sentence. The
        // existing landscape reports pass the swapped page dimensions
        // explicitly rather than relying on the orientation flag alone.
        properties: pageProps({ width: PAGE_W_L, height: PAGE_H_L }),
        headers: { default: makeHeader('Periodic compliance position', generatedAt, CONTENT_W_L) },
        footers: { default: makeFooter() },
        children,
      }],
    });

    const buf = await Packer.toBuffer(doc);
    logger('✅ compliance report:', printed.length, 'rows,', history.length, 'occurrences');

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Compliance_Position.docx"',
      },
    });
  } catch (err) {
    logger('❌ compliance report failed:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
