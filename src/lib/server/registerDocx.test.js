// src/lib/server/registerDocx.test.js
//
// TYPE-1. Builds real documents and reads them back, including one full
// Packer round trip — a document that assembles and will not pack is the
// failure that reaches a user, and it is exactly what static analysis misses.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE } from '$lib/utils/statutoryTemplate.js';
import {
  buildRegisterExtract, extractPreamble, extractTable, cadenceText,
  EXTRACT_COLS, Packer, CONTENT_W_L,
} from './registerDocx.js';

/**
 * Every bit of text in a docx object tree, flattened.
 *
 * ⚠ docx stores a run's text as loose strings inside a node whose `rootKey` is
 * `w:t` — not as a `.text` property, which is what a first attempt assumed and
 * why eleven of these tests initially found an empty string. Reading the real
 * object model is the price of asserting on what the document SAYS rather than
 * only that it packs.
 */
function textOf(node, out = []) {
  if (node === null || typeof node !== 'object') return out;
  if (node.rootKey === 'w:t' && Array.isArray(node.root)) {
    for (const part of node.root) if (typeof part === 'string') out.push(part);
  }
  const children = Array.isArray(node) ? node : Object.values(node);
  for (const child of children) textOf(child, out);
  return out;
}

const rows = (n = 3) => STATUTORY_TEMPLATE.slice(0, n)
  .map(entry => ({ entry, statusLabel: 'Not covered' }));

describe('⛔ the document says what it is not', () => {
  it('states plainly that it is not the obligations statement', () => {
    // The statement is hand-maintained through fourteen review rounds and
    // carries a scope statement, a status block and the reasoning behind every
    // cadence. Once a .docx is in an inbox the two are easy to confuse, and
    // confusing them puts an unreviewed extract in front of a reviewer.
    const text = textOf(extractPreamble({ filterSummary: 'x', shown: 3, total: 116 })).join(' ');
    expect(text).toMatch(/not the obligations statement/i);
    expect(text).toMatch(/must not be sent in its place/i);
    expect(text).toMatch(/no scope statement/i);
  });

  it('names itself an extract in the heading', () => {
    const text = textOf(extractPreamble({ filterSummary: '', shown: 116, total: 116 })).join(' ');
    expect(text).toMatch(/filtered extract/i);
  });

  it('⚠ prints the count as N of M whenever it is a subset', () => {
    // "14 requirements" and "14 of 116 requirements" are different claims, and
    // only the second is true of an extract.
    const text = textOf(extractPreamble({ filterSummary: 'Source: Legislation', shown: 14, total: 116 })).join(' ');
    expect(text).toMatch(/14 of 116/);
    expect(text).toMatch(/Source: Legislation/);
  });

  it('says so explicitly when nothing was filtered out', () => {
    const text = textOf(extractPreamble({ filterSummary: '', shown: 116, total: 116 })).join(' ');
    expect(text).toMatch(/all 116 requirements/);
    expect(text).toMatch(/No filters/i);
  });
});

describe('the columns', () => {
  it('⚠ widths sum to the landscape content width', () => {
    // Word silently reflows a fixed-layout table whose widths do not add up,
    // and the result looks like a styling bug rather than an arithmetic one.
    expect(EXTRACT_COLS.reduce((a, b) => a + b, 0)).toBe(CONTENT_W_L);
  });

  it('is seven columns carrying nine fields', () => {
    const text = textOf(extractTable(rows(1))).join('\n');
    expect(EXTRACT_COLS).toHaveLength(7);
    for (const header of ['Requirement', 'Source', 'Cadence', 'Duty holder in law',
      'Performed by', 'Evidence required', 'Status here']) {
      expect(text).toContain(header);
    }
  });

  it('rides the reference and the applies-when under the name', () => {
    const entry = STATUTORY_TEMPLATE.find(e => e.statutoryRef && e.appliesWhen);
    const text = textOf(extractTable([{ entry, statusLabel: 'Not covered' }])).join('\n');
    expect(text).toContain(entry.name);
    expect(text).toContain(entry.statutoryRef);
    expect(text).toMatch(/Applies when:/);
  });

  it('prints one row per requirement given', () => {
    // ⚠ `root` is protected on docx's XmlComponent; reaching into it is the
    // price of counting rows without packing the file, and it is why this is
    // the only assertion here that touches the library's internals.
    const table = /** @type {any} */ (extractTable(rows(5)));
    // One header row plus five body rows.
    expect(table.root.filter((/** @type {any} */ x) => x?.constructor?.name === 'TableRow'))
      .toHaveLength(6);
  });

  it('⛔ prints the operationally-incomplete marker under the NAME', () => {
    // A reader scanning the status column is exactly the reader who would miss
    // it there — the argument the compliance report already makes.
    const entry = STATUTORY_TEMPLATE.find(e => e.operationallyIncomplete);
    expect(entry, 'the register should still carry interim rows').toBeTruthy();
    const text = textOf(extractTable([{ entry, statusLabel: 'Not covered' }])).join('\n');
    expect(text).toMatch(/OPERATIONALLY INCOMPLETE/);
    expect(text).toMatch(/Completion action:/);
  });

  it('says NOT ASSIGNED where no completion action has been set', () => {
    const entry = { ...STATUTORY_TEMPLATE[0], operationallyIncomplete: true, completionAction: null };
    const text = textOf(extractTable([{ entry, statusLabel: 'Not covered' }])).join('\n');
    expect(text).toMatch(/NOT ASSIGNED/);
  });

  it('never leaves a duty holder cell blank', () => {
    // Blank reads as "not filled in yet". Forty rows genuinely have no
    // statutory holder, and the document should say that rather than nothing.
    const entry = { ...STATUTORY_TEMPLATE[0], statutoryDutyHolder: undefined };
    const text = textOf(extractTable([{ entry, statusLabel: 'Not covered' }])).join('\n');
    expect(text).toMatch(/No statutory duty holder/);
  });
});

describe('cadenceText', () => {
  it('⚠ keeps "stated in the reference" apart from "established practice"', () => {
    // The register spent five review rounds separating those two claims; a
    // document printing only the period would throw the distinction away.
    expect(cadenceText({ frequencyDays: 365, intervalBasis: 'stated' }))
      .toBe('Annual\n(stated in the reference)');
    expect(cadenceText({ frequencyDays: 365, intervalBasis: 'practice' }))
      .toBe('Annual\n(established practice)');
  });

  it('names the common periods in words', () => {
    expect(cadenceText({ frequencyDays: 7 })).toMatch(/^Weekly/);
    expect(cadenceText({ frequencyDays: 182 })).toMatch(/^Six-monthly/);
    expect(cadenceText({ frequencyDays: 84 })).toMatch(/^Quarterly/);
  });

  it('says an event-driven row has no cycle rather than inventing one', () => {
    expect(cadenceText({ frequencyDays: null })).toMatch(/On event/);
    expect(cadenceText({})).toMatch(/On event/);
  });
});

describe('the whole document', () => {
  it('⚠ actually packs — the failure that reaches a user', async () => {
    const doc = buildRegisterExtract({
      rows: STATUTORY_TEMPLATE.map(entry => ({ entry, statusLabel: 'Not covered' })),
      total: STATUTORY_TEMPLATE.length,
      filterSummary: 'No filters — every row',
      generatedAt: '19 September 2026',
    });
    const buf = await Packer.toBuffer(doc);
    expect(buf.byteLength).toBeGreaterThan(5000);
  });

  it('says so rather than producing an empty table when nothing matched', () => {
    const doc = buildRegisterExtract({ rows: [], total: 116, filterSummary: 'Status: Scheduled here' });
    expect(textOf(doc).join(' ')).toMatch(/Nothing matched the filter/i);
  });

  it('stamps the building and the generated date in the header', () => {
    const doc = buildRegisterExtract({ rows: rows(1), total: 116, generatedAt: '19 September 2026' });
    const text = textOf(doc).join(' ');
    expect(text).toContain('Lancaster House — register extract');
    expect(text).toContain('19 September 2026');
  });
});
