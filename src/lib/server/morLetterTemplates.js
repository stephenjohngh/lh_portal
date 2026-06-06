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
} from '$lib/server/docxHelpers.js';
import { fmtDate, fmtDateLong, fmtGenerated } from '$lib/utils/dates';

// ── Common building / org defaults ────────────────────────────────────────────
// These can later be overridden from portal_settings if a richer config UI is
// added. For now they match the rest of the docx pipeline (Lonsdale House).
const DEFAULT_BUILDING_NAME = 'Lonsdale House';
const SIGN_OFF_NAME         = '[Building Safety Manager name]';
const SIGN_OFF_ROLE         = 'Building Safety Manager';
const SIGN_OFF_CONTACT      = '[BSM email · BSM phone]';

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

function signature() {
  return [
    new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }),
    para('Yours sincerely,', { size: 20, after: 360 }),
    para([
      run(SIGN_OFF_NAME, { size: 20, bold: true }), new TextRun({ break: 1, font: 'Arial' }),
      run(SIGN_OFF_ROLE, { size: 20 }),             new TextRun({ break: 1, font: 'Arial' }),
      run(SIGN_OFF_CONTACT, { size: 18, color: COLOURS.textMuted }),
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

// ─── Template 1: Reporter — BSR escalation notification ───────────────────────

export function buildReporterBsrLetter(caseRow, opts = {}) {
  const building = opts.building ?? DEFAULT_BUILDING_NAME;

  const docTitle = `${building} — Notification of escalation to the Building Safety Regulator`;

  const children = [
    heading1(docTitle),
    dateLine(),
    recipientBlock(caseRow.reporter_name, opts.reporterAddress),
    caseRefBlock(caseRow),

    bodyPara(
      'Thank you for raising your safety concern with us. After reviewing what you reported, we have decided to escalate it to the Building Safety Regulator (BSR) under the mandatory occurrence reporting requirements of the Building Safety Act 2022.'
    ),

    heading2('What this means'),
    bodyPara(
      'The BSR will be informed in line with our statutory duty. We are required by law to provide a written report to the regulator within 10 calendar days of the date we identified the occurrence.'
    ),

    caseRow.bsr_notice_ref
      ? bodyPara(`Our BSR notice reference is ${caseRow.bsr_notice_ref}. You can quote this if you need to refer to the case.`)
      : bodyPara('We will share our BSR notice reference with you once it is issued.'),

    heading2('What happens next'),
    bodyPara(
      'Investigation and any necessary works will continue while the regulator is informed. We will keep you updated as the case progresses and write to you again when the matter is resolved.'
    ),
    bodyPara(
      'You can also check progress at any time at the address shown on your original confirmation email, using your reference and verification code.'
    ),

    heading2('If you have any questions'),
    bodyPara(
      'Please contact me using the details below. If at any point you believe there is an immediate danger to anyone in the building, call 999.'
    ),

    ...signature(),
  ];

  return makeDoc(docTitle, children);
}

// ─── Template 2: Reporter — case closure ──────────────────────────────────────

export function buildReporterClosureLetter(caseRow, opts = {}) {
  const building = opts.building ?? DEFAULT_BUILDING_NAME;
  const docTitle = `${building} — Outcome of your safety report`;

  const children = [
    heading1(docTitle),
    dateLine(),
    recipientBlock(caseRow.reporter_name, opts.reporterAddress),
    caseRefBlock(caseRow),

    bodyPara(
      'Thank you again for raising your safety concern. I am writing to let you know that the case has now been closed.'
    ),

    heading2('What was done'),
    bodyPara('[Briefly describe what was investigated and what works were carried out. Keep it factual and avoid identifying any other reporter.]'),

    caseRow.lessons_learned
      ? (() => {
          return [
            heading2('Lessons learned'),
            bodyPara(caseRow.lessons_learned),
          ];
        })()
      : null,

    heading2('If something similar happens again'),
    bodyPara(
      'Please raise it through the same building safety reporting route. We treat every concern seriously and will investigate again. If you believe there is an immediate danger, call 999 first.'
    ),

    heading2('Thank you'),
    bodyPara(
      'Reports from residents and other people in the building are an important part of how we keep ' + building + ' safe. Thank you for taking the time to let us know.'
    ),

    ...signature(),
  ].flat().filter(Boolean);

  return makeDoc(docTitle, children);
}

// ─── Template 3: Reporter — holding update (mid-case) ─────────────────────────

export function buildReporterHoldingLetter(caseRow, opts = {}) {
  const building = opts.building ?? DEFAULT_BUILDING_NAME;
  const docTitle = `${building} — Update on your safety report`;

  // Plain-English current-status phrase. We mirror the public status page's
  // wording so the resident sees consistent language.
  const phraseByStatus = {
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
  const phrase = phraseByStatus[caseRow.status] ?? 'in active review';

  const children = [
    heading1(docTitle),
    dateLine(),
    recipientBlock(caseRow.reporter_name, opts.reporterAddress),
    caseRefBlock(caseRow),

    bodyPara(
      `I am writing with a brief update on the safety concern you raised on ${fmtDate(caseRow.received_date)}.`
    ),

    heading2('Where we are now'),
    bodyPara(`Your case is currently ${phrase}.`),
    bodyPara('[Optional: add a sentence or two specific to this case — what was done most recently, what we expect to happen next, and any expected timescale.]'),

    heading2('What you can do'),
    bodyPara(
      'You can check progress at any time on the building safety status page, using your reference and verification code. If you believe the situation has become more serious, please contact me using the details below — and call 999 if you believe there is an immediate danger.'
    ),

    bodyPara('Thank you for your patience while we work through this.'),

    ...signature(),
  ];

  return makeDoc(docTitle, children);
}

// ─── Template 4: Residents block — closure notice (anonymised) ────────────────

export function buildResidentsClosureLetter(caseRow, opts = {}) {
  const building = opts.building ?? DEFAULT_BUILDING_NAME;
  const docTitle = `${building} — Update on a building safety concern`;

  const children = [
    heading1(docTitle),
    dateLine(),

    para('To all residents and other users of the building', { bold: true, size: 20, after: 240 }),

    bodyPara(
      'I am writing to let you know that a building safety concern was raised under our mandatory occurrence reporting system and has now been investigated and closed.'
    ),
    bodyPara('Out of respect for the privacy of the person who raised it, the source of the report is not disclosed.'),

    heading2('What we looked into'),
    bodyPara('[Briefly describe the nature of the concern, avoiding any detail that could identify the reporter.]'),

    heading2('What we did'),
    bodyPara('[Summarise the investigation and any works carried out. Reference relevant specialist advice (fire engineer, structural engineer) where appropriate.]'),

    caseRow.lessons_learned
      ? (() => [
          heading2('Lessons we are taking forward'),
          bodyPara(caseRow.lessons_learned),
        ])()
      : null,

    heading2('Raising your own concerns'),
    bodyPara(
      'If you notice anything that you think could pose a risk to the safety of the building or the people in it, please raise it through the building safety reporting route described in the residents\' engagement strategy. You can report at any time and you can do so anonymously if you prefer. If you believe there is an immediate danger, call 999.'
    ),

    ...signature(),
  ].flat().filter(Boolean);

  return makeDoc(docTitle, children);
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
