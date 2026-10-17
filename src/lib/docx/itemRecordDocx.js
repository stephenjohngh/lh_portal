// src/lib/docx/itemRecordDocx.js
//
// The record of one workflow item as a Word file (2026-10-17), from the model
// itemRecord.js builds. Built in the browser, like the component report: it is
// one item and a page or two, and everything in it is already on the screen.
// A4 portrait, the shared docxHelpers look: running header with the
// generated-at stamp, page numbers.

import { Document, Packer, Paragraph, Table, TableRow, HeadingLevel, TableLayoutType, WidthType } from 'docx';
import { run, para, hCell, dCell, makeHeader, makeFooter, DOC_STYLES, pageProps, CONTENT_W, COLOURS } from './docxHelpers.js';

// Moves table: when · from → to · by · note (with action and time waited).
const MOVE_COLS = [1700, 2900, 1900, CONTENT_W - 1700 - 2900 - 1900];
const FACT_COLS = [2400, CONTENT_W - 2400];

/** @param {Array<[string,string]>} rows */
function factTable(rows) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: FACT_COLS,
    layout: TableLayoutType.FIXED,
    rows: rows.map(([k, v], i) => new TableRow({ children: [
      dCell(k, FACT_COLS[0], { bold: true, alt: i % 2 === 1 }),
      dCell(v, FACT_COLS[1], { alt: i % 2 === 1 }),
    ] })),
  });
}

/**
 * @param {ReturnType<typeof import('#lib/workflow/itemRecord.js').itemRecordModel>} model
 * @param {{ generatedAt: string, generatedBy: string, filenameStem: string }} meta
 * @returns {Promise<{ bytes: Uint8Array, filename: string }>}
 */
export async function buildItemRecord(model, { generatedAt, generatedBy, filenameStem }) {
  /** @type {Array<Paragraph|Table>} */
  const content = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(model.title, { size: 36, bold: true })] }),
    para(`Record of its handling in the workflow “${model.workflowName}”.`, { color: COLOURS.textMuted }),
    para(`Produced ${generatedAt} by ${generatedBy}.`, { color: COLOURS.textMuted, after: 240 }),
  ];
  if (model.reviewMark) {
    content.push(para(`This workflow is marked as needing a full review before any change: ${model.reviewMark}.`, { color: COLOURS.textMuted }));
  }

  content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run('Where it stands')] }));
  const nowRows = /** @type {Array<[string,string]>} */ ([
    ['Step', model.now.kind ? `${model.now.step} (${model.now.kind})` : model.now.step],
    ['In this step since', model.now.since],
  ]);
  if (model.now.due) nowRows.push(['Deadline', model.now.due]);
  content.push(factTable(nowRows));

  if (model.facts.length) {
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run('Details')] }));
    content.push(factTable(model.facts));
  }
  for (const s of model.sections) {
    content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(s.heading)] }));
    for (const line of String(s.text).split(/\n{2,}/)) content.push(para(line.replace(/\n/g, ' ')));
  }

  content.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run('History')] }));
  if (model.moves.length) {
    content.push(new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: MOVE_COLS,
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ tableHeader: true, children: [
          hCell('When', MOVE_COLS[0]), hCell('Move', MOVE_COLS[1]), hCell('By', MOVE_COLS[2]), hCell('Note', MOVE_COLS[3]),
        ] }),
        ...model.moves.map((m, i) => new TableRow({ cantSplit: true, children: [
          dCell(m.at, MOVE_COLS[0], { alt: i % 2 === 1 }),
          dCell([m.from ? `${m.from} → ${m.to}` : `Started: ${m.to}`, m.waited ? `after ${m.waited} in the step before` : ''].filter(Boolean).join('\n'), MOVE_COLS[1], { alt: i % 2 === 1 }),
          dCell(m.by, MOVE_COLS[2], { alt: i % 2 === 1 }),
          dCell([m.note, m.action ? `Action run: ${m.action}` : ''].filter(Boolean).join('\n') || '—', MOVE_COLS[3], { alt: i % 2 === 1 }),
        ] })),
      ],
    }));
  }
  content.push(para('', { after: 120 }));
  for (const n of model.notes) content.push(para(n, { size: 16, color: COLOURS.textMuted, after: 60 }));

  const doc = new Document({
    styles: DOC_STYLES,
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader(model.title, generatedAt) },
      footers: { default: makeFooter() },
      children: content,
    }],
  });
  const bytes = await Packer.pack(doc, 'uint8array');
  const safe = filenameStem.replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'Record';
  return { bytes, filename: `Record_${safe}.docx` };
}
