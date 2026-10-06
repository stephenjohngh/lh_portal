// parking/utils/permitLayout.js
// WHERE everything goes on a parking permit, as a list of drawing steps. Pure:
// it measures nothing and draws nothing, so it can be tested; permitRender.js
// carries the steps out on a canvas.
//
// The page is A4 portrait at 300 dpi (2480 × 3508 px), the size the paper
// permits were made at. ⛔ The bottom third is the template's fixed image and
// nothing is ever written over it (user, 2026-10-06: "the image is fixed and
// all new text is in the first 2/3 of permit") — the layout asserts that every
// text step ends above the line.

import { fmtDateOnly } from '#lib/utils/dates.js';
import { permitNumberLabel } from './permitModel.js';

export const PAGE = Object.freeze({ width: 2480, height: 3508 });
/** Where the fixed bottom image starts: two-thirds of the way down. */
export const TOP_HEIGHT = Math.round(PAGE.height * 2 / 3);

const MARGIN = 170;
const GREEN = '#2e7d4f';
const INK   = '#2a1414';

/**
 * @typedef {{ type: 'image', which: 'background'|'footer', x: number, y: number, w: number, h: number, fit: 'cover'|'contain' }} ImageStep
 * @typedef {{ type: 'text', text: string, x: number, y: number, size: number, bold?: boolean,
 *             colour: string, align: 'left'|'center', maxWidth: number, maxLines?: number }} TextStep
 * @typedef {ImageStep | TextStep} Step
 */

/**
 * @param {{ permit_number: number, company: string, registration: string,
 *           valid_from: string, valid_to: string, issued_by: string }} permit
 * @param {{ title?: string|null, location?: string|null, conditions?: string|null }} template
 * @param {{ name: string, address?: string|null }} building
 * @returns {Step[]}
 */
export function permitLayout(permit, template, building) {
  const W = PAGE.width;
  const full = W - 2 * MARGIN;
  const centre = W / 2;
  /** @type {Step[]} */
  const steps = [
    { type: 'image', which: 'background', x: 0, y: 0,          w: W, h: TOP_HEIGHT,               fit: 'cover' },
    { type: 'image', which: 'footer',     x: 0, y: TOP_HEIGHT, w: W, h: PAGE.height - TOP_HEIGHT, fit: 'contain' },
  ];
  const text = (t) => steps.push({ type: 'text', align: 'center', x: centre, maxWidth: full, ...t });

  text({ text: building.name,                   y: 300, size: 210, colour: GREEN });
  const address = oneLine(building.address);
  if (address) text({ text: address,             y: 560, size: 110, colour: GREEN });
  text({ text: template.title || 'Parking Permit', y: 790, size: 160, colour: GREEN });
  const location = oneLine(template.location);
  if (location) text({ text: location,           y: 990, size: 85,  colour: INK });

  // The details: label on the left, value beside it.
  const labelW = 760;
  const rows = [
    { label: 'Company',      value: permit.company,                 size: 95 },
    { label: 'Registration', value: permit.registration,            size: 125 },
    { label: 'Valid from',   value: fmtDateOnly(permit.valid_from), size: 95 },
    { label: 'Valid to',     value: fmtDateOnly(permit.valid_to),   size: 95 },
    { label: 'Issued by',    value: permit.issued_by,               size: 95 },
  ];
  let y = 1210;
  for (const { label, value, size } of rows) {
    steps.push({ type: 'text', text: `${label}:`, x: MARGIN, y, size: 95, bold: true,
      colour: INK, align: 'left', maxWidth: labelW - 40 });
    steps.push({ type: 'text', text: String(value ?? ''), x: MARGIN + labelW, y: y - (size - 95) / 2, size,
      bold: label === 'Registration', colour: INK, align: 'left', maxWidth: full - labelW });
    y += 175;
  }

  text({ text: `Permit number: ${permitNumberLabel(permit.permit_number)}`,
    y: 2050, size: 125, bold: true, colour: INK });

  const conditions = String(template.conditions ?? '').trim();
  if (conditions) text({ text: conditions, y: 2190, size: 52, colour: INK, maxLines: 2 });

  return steps;
}

/** A multi-line address on one printed line. */
function oneLine(s) {
  return String(s ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(', ');
}
