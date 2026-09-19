// src/lib/server/statementDocx.js
//
// The Periodic Obligations Statement, as a Word document. R5.
//
// ⭐ THIS IS THE ARTEFACT THE WHOLE BUILD PLAN EXISTS FOR. An accountable
// person facing a BSR assessment in 2028 has to produce this document. Until
// now that required one particular laptop, because the register was code the
// deployment could not edit and the prose was a markdown file in gitignored
// `docs/`. Both are now data the app holds, and this turns them into the
// document.
//
// ⛔ IT IS THE STATEMENT, NOT AN EXTRACT, and the distinction runs the other way
// from `registerDocx.js`. That file spends its first page insisting it is NOT
// this document. This one is, so what it must instead be honest about is where
// its content came from: whether the register and the prose were read from this
// building's own records or fell back to the text that ships. A statement
// assembled from the shipped defaults describes a standard higher-risk building
// and would be read as describing this one.
//
// ⚠ Portrait, unlike the register extract. That is landscape because it has
// seven columns; this is prose and two-column label/value tables, which read
// badly across a landscape page.

import { Document, Packer } from 'docx';
import {
  CONTENT_W, COLOURS, DOC_STYLES,
  run, para, makeHeader, makeFooter, pageProps,
} from './docxHelpers.js';
import { markdownToDocx } from './markdownDocx.js';
import { assembleStatement } from './statementDocument.js';

/**
 * The provenance block, printed only when there is something to say.
 *
 * ⚠ SILENT WHEN EVERYTHING IS THIS BUILDING'S OWN. A banner on every copy
 * saying "read from the database" is noise that stops being read, and this is
 * the same argument as the per-row provenance line in §6: say it where it
 * changes what the reader should conclude, and nowhere else.
 *
 * @param {{registerSource?: string, proseSource?: string}} src
 * @returns {import('docx').Paragraph[]}
 */
function sourceWarning({ registerSource, proseSource }) {
  const fellBack = [
    registerSource !== 'database' && 'the register',
    proseSource !== 'database' && 'the explanatory sections',
  ].filter(Boolean);
  if (fellBack.length === 0) return [];

  return [
    para([run('⛔ THIS COPY IS NOT COMPLETE — DO NOT SEND IT', { bold: true, size: 22, color: COLOURS.failRed })],
      { before: 0, after: 80 }),
    para([run(
      `${fellBack.join(' and ')} could not be read from this building's records, so `
      + 'the standard text that ships with the system was used instead. That text describes a '
      + 'higher-risk residential building in general; it is not a record of what this building '
      + 'holds, and a reader has no way of telling the difference. Import or reload, and '
      + 'generate it again.',
      { size: 18, color: COLOURS.failRed },
    )], { before: 0, after: 240 }),
  ];
}

/**
 * The statement as an array of docx blocks — the CONTENT.
 *
 * @param {Object} payload
 * @param {{key: string, position: number, generated: boolean, markdown: string}[]} payload.prose
 * @param {Object[]} payload.entries                       the whole register
 * @param {Record<string, Object>} [payload.provenance]    per register row
 * @param {'database'|'seed'} [payload.registerSource]
 * @param {'database'|'seed'} [payload.proseSource]
 * @returns {(import('docx').Paragraph|import('docx').Table)[]}
 */
export function statementBlocks(payload) {
  const {
    prose, entries, provenance = {},
    registerSource = 'database', proseSource = 'database',
  } = payload ?? {};

  // ⚠ The assembler throws rather than dropping a row or a section, and this
  // must NOT catch it. A statement short one duty is the worst thing this code
  // could produce, and it would look perfectly normal.
  const markdown = assembleStatement({ prose, entries, provenance });

  return [
    ...sourceWarning({ registerSource, proseSource }),
    ...markdownToDocx(markdown, { width: CONTENT_W }),
  ];
}

/**
 * The same content, packaged as a Word document.
 *
 * ⚠ Split from `statementBlocks` so the CONTENT can be asserted without
 * reaching into docx's own object graph for a `Document`'s children — which is
 * private, undocumented and has no reason to stay where it is.
 *
 * @param {Parameters<typeof statementBlocks>[0] & {generatedAt: string, building?: string}} payload
 * @returns {Document}
 */
export function buildStatementDocx(payload) {
  const { generatedAt, building = 'Lancaster House' } = payload ?? {};
  const children = statementBlocks(payload);

  return new Document({
    styles: DOC_STYLES,
    sections: [{
      properties: pageProps(),
      // ⚠ The generated-at stamp lives HERE and not in the markdown. The same
      // prose and the same register must produce the same bytes, or the gate
      // that is the only evidence any of this is safe stops working — so the
      // timestamp belongs to the artefact rather than to the text. This is also
      // where the other nine generated documents put it.
      headers: { default: makeHeader(`${building} — safety obligations`, generatedAt) },
      footers: { default: makeFooter() },
      children,
    }],
  });
}

export { Packer };
