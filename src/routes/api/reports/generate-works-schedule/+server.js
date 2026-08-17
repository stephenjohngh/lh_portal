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

/** Column widths, as a share of the content width. */
const COLS = [0.14, 0.16, 0.12, 0.16, 0.30, 0.12];

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

/** The attributes a line specifies, as "Wattage 15, Colour 4000K". */
function attrText(item) {
  const labels = item.attribute_labels ?? {};
  const parts = Object.entries(labels).map(([label, value]) => `${label} ${value}`);
  return parts.join(', ');
}

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const schedule = body?.schedule;
  const items    = Array.isArray(body?.items) ? body.items : [];
  const floors   = Array.isArray(body?.floors) ? body.floors : [];

  if (!schedule?.title) {
    return json({ error: 'A schedule is required' }, { status: 400 });
  }

  const floorName = new Map(floors.map(f => [f.id, f.name ?? f.label ?? '']));
  const w = widths();

  try {
    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          hCell('Ref',      w[0]), hCell('Location', w[1]),
          hCell('Type',     w[2]), hCell('Action',   w[3]),
          hCell('What is required', w[4]), hCell('Done', w[5]),
        ],
      }),
      ...items.map(item => {
        const c = item.component ?? {};
        const required = [
          item.target_type_code ? `Fit: ${item.target_type_code}` : '',
          attrText(item),
          item.spec ?? '',
          item.notes ?? '',
        ].filter(Boolean).join('\n');

        return new TableRow({
          children: [
            dCell(c.asset_id ?? '—',                w[0]),
            dCell(floorName.get(c.floor_id) ?? '—', w[1]),
            dCell(c.type_code ?? '—',               w[2]),
            dCell(ACTION_LABEL[item.action] ?? item.action, w[3]),
            // Blank rather than a dash: this column is where a contractor
            // writes, and a dash in it reads as an instruction.
            dCell(required || '', w[4]),
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
