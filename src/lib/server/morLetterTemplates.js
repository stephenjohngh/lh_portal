// src/lib/server/morLetterTemplates.js
// Phase 2c — Reporter-contact draft letter builders.
//
// Each template returns a `docx` Document object ready for Packer.toBuffer().
// Drafts are written to be edited before sending — placeholders in square
// brackets prompt the staff member to fill in details that aren't safely
// derived from the case row (e.g. specific remediation details).
//
// Auto-emails are out of scope for this phase. These letters are generated
// for the staff member to review, edit, and send by whatever channel they
// choose (email, post, hand-delivery).

import {
  Document, Paragraph, TextRun, HeadingLevel,
  BorderStyle,
} from 'docx';
import {
  COLOURS, DOC_STYLES, pageProps, makeHeader, makeFooter,
  run, para,
} from '#lib/server/docxHelpers.js';
import { fmtDate, fmtDateLong, fmtGenerated } from '#lib/utils/dates.js';
import { organisationOrPlaceholders } from '#lib/utils/identity.js';
import { letterBlocks, wordingText, wording } from '#lib/utils/wording.js';

// ── The building and the signatory ────────────────────────────────────────────
// From Admin → Other Config → Building & business (#lib/utils/identity.js), via
// the route: `opts.building` (its name) and `opts.organisation`. They used to be
// written here — the building as "Lonsdale House", the signatory as a bracketed
// placeholder on every letter. An unset field still prints as its placeholder,
// for the staff member to fill in before sending.
const UNSET_BUILDING = '[Building name]';

// Small helpers -----------------------------------------------------------------

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 80 },
    children: [run(text, { size: 36, bold: true, color: COLOURS.textDark })],
  });
}

function heading2(text) {
  return para(text, { bold: true, size: 24, color: COLOURS.subheading, before: 120, after: 100 });
}

function bodyPara(text) {
  return para(text, { size: 20, after: 180 });
}

/** @param {Record<string, string>} [organisation] */
function signature(organisation) {
  const o = organisationOrPlaceholders(organisation);
  return [
    new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }),
    para('Yours sincerely,', { size: 20, after: 360 }),
    para([
      run(o.signatoryName, { size: 20, bold: true }), new TextRun({ break: 1, font: 'Arial' }),
      run(o.signatoryRole, { size: 20 }),             new TextRun({ break: 1, font: 'Arial' }),
      run(o.signatoryContact, { size: 18, color: COLOURS.textMuted }),
    ], { after: 0 }),
  ];
}

function recipientBlock(reporter, address) {
  const lines = [
    reporter || '[Reporter name]',
    ...(address ? address.split('\n') : ['[Address line 1]', '[Address line 2]']),
  ];
  return new Paragraph({
    spacing: { before: 0, after: 240 },
    children: lines.flatMap((line, i) => [
      run(line, { size: 20 }),
      i < lines.length - 1 ? new TextRun({ break: 1, font: 'Arial' }) : null,
    ].filter(Boolean)),
  });
}

function dateLine() {
  return para(fmtDateLong(new Date().toISOString()), { size: 20, after: 240 });
}

function caseRefBlock(caseRow) {
  return new Paragraph({
    spacing: { before: 0, after: 240 },
    border:  { top:    { style: BorderStyle.SINGLE, size: 4, color: COLOURS.border, space: 6 },
               bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOURS.border, space: 6 } },
    children: [
      run('Our reference: ', { bold: true, size: 20 }),
      run(caseRow.reference, { size: 20 }),
    ],
  });
}

function makeDoc(title, children) {
  return new Document({
    styles: DOC_STYLES,
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader(title, fmtGenerated()) },
      footers: { default: makeFooter() },
      children,
    }],
  });
}

// ─── The letters ──────────────────────────────────────────────────────────────
// The WORDS are an admin setting (Admin → Other Config → Wording,
// #lib/utils/wording.js) — they used to be written here. What stays here is
// what must not be edited away: the date, the recipient, the case reference
// under the title and the signature. The route reads the setting first
// (loadServerWording), so wordingText() returns what is in force.

/** Turn a letter's blocks into paragraphs. */
function letterChildren(caseRow, opts, key, vars) {
  const { title, blocks } = letterBlocks(wordingText(key), vars);
  const docTitle = title || vars.building;
  const body = blocks.map((b) =>
    b.kind === 'heading' ? heading2(b.text)
    : b.kind === 'bold'  ? para(b.text, { bold: true, size: 20, after: 240 })
    : bodyPara(b.text));
  return {
    docTitle,
    children: [
      heading1(docTitle),
      dateLine(),
      ...(opts.noRecipient ? [] : [recipientBlock(caseRow.reporter_name, opts.reporterAddress)]),
      ...(opts.noRecipient ? [] : [caseRefBlock(caseRow)]),
      ...body,
      ...signature(opts.organisation),
    ],
  };
}

function buildLetter(key, caseRow, opts, vars) {
  const { docTitle, children } = letterChildren(caseRow, opts, key, {
    building: opts.building ?? UNSET_BUILDING, ...vars,
  });
  return makeDoc(docTitle, children);
}

// Plain-English current-status phrase for the holding letter: one per state,
// so it belongs to the MOR lifecycle rather than to the editable wording.
const STATUS_PHRASE = {
  submitted:         'received and is in the queue for our safety team',
  acknowledged:      'acknowledged and is being prepared for review',
  in_triage:         'in initial review against the building safety threshold',
  in_assessment:     'with a technical advisor for further assessment',
  decision_pending:  'awaiting a formal decision from our Accountable Person',
  bsr_notice:        'has been escalated to the Building Safety Regulator',
  bsr_report:        'with the Building Safety Regulator while we prepare the full report',
  in_remediation:    'in active remediation — the necessary works are underway',
  awaiting_reporter: 'paused while we wait for further information from you',
  awaiting_bsr:      'awaiting a response from the Building Safety Regulator',
  remediated:        'remediation is complete and the case is being prepared for formal close-out',
  reopened:          'reopened with new information for further review',
};

export function buildReporterBsrLetter(caseRow, opts = {}) {
  const note = caseRow.bsr_notice_ref
    ? wording('morBsrReferenceIssued', { bsr_reference: caseRow.bsr_notice_ref })
    : wording('morBsrReferencePending');
  return buildLetter('morReporterBsr', caseRow, opts, { bsr_reference_note: note });
}

export function buildReporterClosureLetter(caseRow, opts = {}) {
  return buildLetter('morReporterClosure', caseRow, opts, { lessons_learned: caseRow.lessons_learned });
}

export function buildReporterHoldingLetter(caseRow, opts = {}) {
  return buildLetter('morReporterHolding', caseRow, opts, {
    received_date: fmtDate(caseRow.received_date),
    status: STATUS_PHRASE[caseRow.status] ?? 'in active review',
  });
}

export function buildResidentsClosureLetter(caseRow, opts = {}) {
  return buildLetter('morResidentsClosure', caseRow, { ...opts, noRecipient: true },
    { lessons_learned: caseRow.lessons_learned });
}

// ─── Dispatch table ───────────────────────────────────────────────────────────

export const LETTER_BUILDERS = {
  reporter_bsr:       buildReporterBsrLetter,
  reporter_closure:   buildReporterClosureLetter,
  reporter_holding:   buildReporterHoldingLetter,
  residents_closure:  buildResidentsClosureLetter,
};

export const LETTER_FILENAME_SUFFIX = {
  reporter_bsr:       'reporter-bsr',
  reporter_closure:   'reporter-closure',
  reporter_holding:   'reporter-holding',
  residents_closure:  'residents-closure',
};
