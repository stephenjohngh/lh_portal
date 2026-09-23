// src/lib/server/registerDocx.test.js
//
// TYPE-1. Builds real documents and reads them back, including one full
// Packer round trip — a document that assembles and will not pack is the
// failure that reaches a user, and it is exactly what static analysis misses.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE } from '$lib/utils/statutoryTemplate.js';
import {
  buildRegisterDocument, documentPreamble, isWholePicture, narrativeSection,
  SECTIONS, extractTable, cadenceText, fallbackBanner,
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

// ⭐ THE DOCUMENT DECIDES WHAT IT IS FROM WHAT IT CONTAINS. There used to be
// two documents and a red warning telling people not to confuse them — a
// caution that existed only because there were two. With one, an unfiltered
// copy carrying every section IS the obligations statement, and anything else
// is honestly an extract of it.
const ALL = { caveats: true, absences: true, actions: true };
const preamble = over =>
  textOf(documentPreamble({
    filterSummary: '', shown: 116, total: 116, sections: ALL, building: 'Lancaster House', ...over,
  })).join(' ');

describe('what the document calls itself', () => {
  it('is the OBLIGATIONS STATEMENT when nothing is filtered and every section is in', () => {
    expect(isWholePicture({ shown: 116, total: 116, sections: ALL })).toBe(true);
    const text = preamble();
    expect(text).toMatch(/statement of periodic safety obligations/i);
    expect(text, 'the statement must not call itself an extract').not.toMatch(/this is an extract/i);
  });

  it('is an EXTRACT the moment a filter is applied', () => {
    expect(isWholePicture({ shown: 14, total: 116, sections: ALL })).toBe(false);
    const text = preamble({ shown: 14, filterSummary: 'Source: Legislation' });
    expect(text).toMatch(/this is an extract/i);
    // ⚠ "14 requirements" and "14 of 116 requirements" are different claims,
    // and only the second is true of a subset.
    expect(text).toMatch(/14 of 116/);
    expect(text).toMatch(/Source: Legislation/);
  });

  // ⛔ The subtle one: everything shown, but a section switched off. A reader
  // has every requirement and no idea what the list does not claim.
  it('is an EXTRACT when a section is left out, even with every row', () => {
    const sections = { caveats: true, absences: true, actions: false };
    expect(isWholePicture({ shown: 116, total: 116, sections })).toBe(false);
    const text = preamble({ sections });
    expect(text).toMatch(/this is an extract/i);
    expect(text, 'it must name what it omits').toMatch(/what is outstanding/i);
  });

  it('tells a reader how to turn an extract into the statement', () => {
    expect(preamble({ shown: 14 })).toMatch(/no filter and every section/i);
  });

  it('states its coverage either way', () => {
    expect(preamble()).toMatch(/all 116 compliance obligations/);
    expect(preamble({ shown: 14 })).toMatch(/14 of 116/);
  });
});

describe('⛔ a document built from the shipped catalogue says so', () => {
  // ⛔ THE REGRESSION THIS PINS, AND IT SHIPPED. Every read path falls back to
  // the register that SHIPS — empty table, failed query, no network — which is
  // right for a SCREEN, because "no requirements" is the most dangerous thing a
  // compliance screen could say. It is the opposite for a FILE that leaves the
  // building: titled "statement of periodic safety obligations", filed as
  // Obligations_Statement_<date>.docx and built entirely from the standard
  // catalogue, it describes a higher-risk building IN GENERAL while reading as a
  // description of this one.
  //
  // ⚠ The banner existed in `statementDocx.js` and was lost with the prose
  // machinery. For a day the panel promised "the file will say so" and the file
  // said nothing — a screen asserting something about a document it does not
  // produce, which no guard could see.
  const banner = over => preamble({ fromSeed: true, ...over });

  it('prints a refusal banner when the register came from the seed', () => {
    expect(banner()).toContain('NOT THIS BUILDING’S POSITION');
    expect(banner()).toContain('DO NOT SEND IT');
    expect(banner()).toContain('standard catalogue');
  });

  it('⚠ says nothing at all when the register IS this building’s', () => {
    // A banner on every copy stops being read, which is the one thing a warning
    // cannot afford — the same argument as the per-row provenance line.
    const clean = preamble({ fromSeed: false });
    expect(clean).not.toContain('NOT THIS BUILDING’S POSITION');
    expect(clean).not.toContain('DO NOT SEND IT');
    expect(fallbackBanner(false)).toEqual([]);
  });

  it('⛔ warns on the STATEMENT too, not only on an extract', () => {
    // The statement is the dangerous one: an extract at least announces itself
    // as a slice, where an unfiltered copy carries the full title and filename.
    const asStatement = banner({ shown: 116, total: 116, sections: ALL });
    expect(asStatement).toContain('statement of periodic safety obligations');
    expect(asStatement).toContain('DO NOT SEND IT');
  });

  it('puts the banner before the title, not under it', () => {
    const text = banner();
    expect(text.indexOf('DO NOT SEND IT'))
      .toBeLessThan(text.indexOf('statement of periodic safety obligations'));
  });

  it('defaults to silent when the caller says nothing', () => {
    // ⚠ The safe direction only because the panel passes it explicitly. A
    // missing flag prints no banner; the panel is what makes that correct.
    expect(preamble({})).not.toContain('DO NOT SEND IT');
  });

  it('reaches the whole document, not just the preamble', () => {
    const doc = buildRegisterDocument({
      rows: rows(2), total: 2, sections: ALL, items: {}, fromSeed: true,
    });
    expect(textOf(doc).join(' ')).toContain('DO NOT SEND IT');
  });
});

describe('the sections that used to be prose', () => {
  const items = [
    { key: 'a1', name: 'Determine the evacuation strategy', description: 'And approve it.',
      consequence: 'A statutory deliverable is blocked.', unblocks: 'The evacuation plan.' },
  ];

  it('prints an action with its consequence and what it unblocks', () => {
    const text = textOf(narrativeSection(SECTIONS[2], items)).join(' ');
    expect(text).toMatch(/Determine the evacuation strategy/);
    expect(text).toMatch(/If it is not:/);
    expect(text).toMatch(/A statutory deliverable is blocked/);
    expect(text).toMatch(/Unblocks:/);
  });

  // ⛔ The blank IS the content. Filling owner and due date with plausible
  // names would defeat the purpose — an unassigned action with a blank owner is
  // conspicuous every time the document is produced; a paragraph is not.
  it('prints NOT ASSIGNED rather than hiding an empty owner', () => {
    const text = textOf(narrativeSection(SECTIONS[2], items)).join(' ');
    expect(text).toMatch(/Owner:\s*NOT ASSIGNED/);
    expect(text).toMatch(/Technical authority:\s*NOT ASSIGNED/);
    expect(text).toMatch(/Due:\s*NOT ASSIGNED/);
  });

  it('does not print the assignment line on a caveat, which has no owner', () => {
    const text = textOf(narrativeSection(SECTIONS[0], [{ key: 'c1', name: 'A caveat', description: 'x' }])).join(' ');
    expect(text).not.toMatch(/NOT ASSIGNED/);
  });

  it('renders nothing at all for an empty section', () => {
    expect(narrativeSection(SECTIONS[1], [])).toEqual([]);
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
    for (const header of ['Compliance obligation', 'Source', 'Cadence', 'Duty holder in law',
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
  const everyRow = STATUTORY_TEMPLATE.map(entry => ({ entry, statusLabel: 'Not covered' }));

  it('⚠ actually packs — the failure that reaches a user', async () => {
    const doc = buildRegisterDocument({
      rows: everyRow,
      total: STATUTORY_TEMPLATE.length,
      filterSummary: '',
      generatedAt: '19 September 2026',
      sections: ALL,
      items: {
        caveats: [{ key: 'c', name: 'A caveat', description: 'x' }],
        absences: [{ key: 'b', name: 'An absence', description: 'y' }],
        actions: [{ key: 'a', name: 'An action', consequence: 'z' }],
      },
    });
    const buf = await Packer.toBuffer(doc);
    expect(buf.byteLength).toBeGreaterThan(5000);
  });

  it('says so rather than producing an empty table when nothing matched', () => {
    const doc = buildRegisterDocument({ rows: [], total: 116, filterSummary: 'Status: Scheduled here' });
    expect(textOf(doc).join(' ')).toMatch(/no compliance obligations in it/i);
  });

  it('titles the header from the same rule as the body', () => {
    const extract = buildRegisterDocument({ rows: rows(1), total: 116, generatedAt: '19 September 2026' });
    expect(textOf(extract).join(' ')).toContain('Lancaster House — register extract');

    const statement = buildRegisterDocument({
      rows: everyRow, total: STATUTORY_TEMPLATE.length,
      generatedAt: '19 September 2026', sections: ALL,
    });
    const text = textOf(statement).join(' ');
    expect(text).toContain('Lancaster House — obligations statement');
    expect(text).toContain('19 September 2026');
  });

  // ⚠ A section switched on but with nothing in it must not print a bare
  // heading — an empty "What is outstanding" reads as "nothing is outstanding",
  // which is the opposite of what an empty list means here.
  it('omits a section heading when that section has no rows', () => {
    const doc = buildRegisterDocument({
      rows: rows(1), total: 116, sections: ALL, items: {},
    });
    const text = textOf(doc).join(' ');
    expect(text).not.toMatch(/What is outstanding/i);
  });
});
