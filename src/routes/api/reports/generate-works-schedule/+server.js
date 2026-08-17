// src/routes/api/reports/generate-works-schedule/+server.js
// The document a contractor is actually sent.
//
// POST { schedule, items, floors }
//
// Two things shape it. First, the heading says what the document IS — a request
// for a price, or an instruction to proceed — because the same list of
// components is both at different times and a contractor needs to know which
// they are holding. Second, the counts come before the detail: "Replace 38,
// Remove 2" is the size of the job, and it is the first thing anyone reads.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, HeadingLevel,
  WidthType, TableLayoutType,
} from 'docx';
import {
  CONTENT_W, COLOURS, BORDERS, hCell, dCell, run, para,
  makeHeader, makeFooter, DOC_STYLES, pageProps,
} from '$lib/server/docxHelpers.js';
import { getLogger } from '$lib/utils/logger';
import { fmtToday } from '$lib/utils/dates';

const logger = getLogger('reports:works-schedule');

const ACTION_LABEL = {
  replace: 'Replace', remove: 'Remove', repair: 'Repair',
  relocate: 'Relocate', leave: 'Leave',
};

const PURPOSE_HEADING = {
  quote: 'Request for quotation',
  works: 'Instruction to proceed',
};

/**
 * Column widths, as a share of the content width.
 * Ref · Existing · Action · Required · Price · Done — the last two left empty
 * for the contractor to complete and return.
 */
const COLS = [0.13, 0.22, 0.11, 0.30, 0.12, 0.12];

function widths() {
  return COLS.map(c => Math.round(CONTENT_W * c));
}

/** "Replace 38 · Remove 2" — the size of the job, before any detail. */
function summarise(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.action, (counts.get(item.action) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([action, n]) => `${ACTION_LABEL[action] ?? action} ${n}`)
    .join(' · ');
}

// Names, references and attribute text are resolved by the CLIENT and arrive
// ready to print. They live in the store the author is looking at, and a
// contractor's document must never say "light_led_batten" where a person would
// say "LED Batten". Rebuilding them here would be a second lookup path that
// could disagree with what was on screen.

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const schedule = body?.schedule;
  const items    = Array.isArray(body?.items) ? body.items : [];

  if (!schedule?.title) {
    return json({ error: 'A schedule is required' }, { status: 400 });
  }

  const w = widths();

  try {
    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          hCell('Ref',    w[0]), hCell('Existing', w[1]),
          hCell('Action', w[2]), hCell('What is required', w[3]),
          hCell('Price',  w[4]), hCell('Done', w[5]),
        ],
      }),
      ...items.map(item => {
        // What is there now — type name and its attributes, exactly as the
        // register shows them.
        const existing = [item.current_type, item.current_attrs]
          .filter(Boolean).join('\n');
        const required = [
          item.target_type_name ? `Fit: ${item.target_type_name}` : '',
          item.target_attrs ?? '',
          item.spec ?? '',
          item.notes ?? '',
        ].filter(Boolean).join('\n');

        return new TableRow({
          children: [
            dCell(item.ref ?? '—',  w[0]),
            dCell(existing || '—',  w[1]),
            dCell(ACTION_LABEL[item.action] ?? item.action, w[2]),
            dCell(required || '',   w[3]),
            // Blank rather than dashed: these are the columns a contractor
            // writes in, and a dash in one reads as an instruction.
            dCell('', w[4]),
            dCell('', w[5]),
          ],
        });
      }),
    ];

    const doc = new Document({
      styles: DOC_STYLES,
      sections: [{
        properties: pageProps(),
        headers: { default: makeHeader(schedule.title, fmtToday()) },
        footers: { default: makeFooter() },
        children: [
          para(PURPOSE_HEADING[schedule.purpose] ?? 'Schedule of works',
            { heading: HeadingLevel.HEADING_1 }),
          para(schedule.title, { heading: HeadingLevel.HEADING_2 }),

          new Paragraph({
            spacing: { after: 120 },
            children: [run(summarise(items), { bold: true, size: 24 })],
          }),

          ...(schedule.reference
            ? [new Paragraph({ children: [run(`Our reference: ${schedule.reference}`, { size: 20 })] })]
            : []),
          ...(schedule.contractor_name
            ? [new Paragraph({ children: [run(`For: ${schedule.contractor_name}`, { size: 20 })] })]
            : []),
          ...(schedule.notes
            ? [new Paragraph({
                spacing: { before: 160, after: 160 },
                children: [run(schedule.notes, { size: 20 })],
              })]
            : []),

          new Table({
            rows,
            width: { size: CONTENT_W, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            borders: BORDERS,
          }),

          new Paragraph({
            spacing: { before: 240 },
            children: [run(
              'Every item above refers to an asset already recorded in the '
              + 'building register. Please keep the reference against each line '
              + 'when reporting back, so the register can be updated from it.',
              { size: 18, color: COLOURS.subheading },
            )],
          }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    logger('✅ works schedule document,', items.length, 'lines');

    return new Response(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition':
          `attachment; filename="${(schedule.title || 'works-schedule')
            .replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')}.docx"`,
      },
    });
  } catch (err) {
    logger('❌', err);
    return json({ error: err instanceof Error ? err.message : String(err) },
      { status: 500 });
  }
}
