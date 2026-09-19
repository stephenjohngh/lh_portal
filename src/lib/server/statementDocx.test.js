// src/lib/server/statementDocx.test.js
//
// The obligations statement as a Word document. R5.
//
// ⚠ ONE OF THESE ACTUALLY SERIALISES THE DOCUMENT. A document that assembles
// in memory and then throws on `Packer.toBuffer` is the failure that reaches a
// user, and it is invisible to every other kind of test — the same reason
// `xlsxWorkbook` round-trips through `writeBuffer`.

import { describe, it, expect } from 'vitest';
import { STATEMENT_PROSE } from '$lib/utils/statementProse.js';
import { STATUTORY_TEMPLATE } from '$lib/utils/statutoryTemplate.js';
import { buildStatementDocx, statementBlocks, Packer } from './statementDocx.js';

const base = {
  prose: STATEMENT_PROSE,
  entries: STATUTORY_TEMPLATE,
  generatedAt: '19 Sep 2026, 16:20',
  building: 'Lancaster House',
};

/** Every character of text in the document, in order. See markdownDocx.test.js. */
function textOf(node) {
  if (node == null || typeof node !== 'object') return '';
  let out = '';
  if (node.rootKey === 'w:t' && Array.isArray(node.root)) {
    for (const r of node.root) if (typeof r === 'string') out += r;
  }
  for (const child of Array.isArray(node.root) ? node.root : []) {
    out += textOf(child);
    if (child?.rootKey === 'w:tc') out += ' ';
  }
  return out;
}

// ⚠ Asserted against the BLOCKS, not against a packed Document. Where docx
// keeps a Document's children is private and undocumented, and a test that
// walks it is testing the library rather than this code.
const bodyText = payload => statementBlocks(payload).map(textOf).join('\n');

describe('the statement document', () => {
  it('serialises to a real .docx buffer', async () => {
    const buf = await Packer.toBuffer(buildStatementDocx(base));
    expect(buf.length).toBeGreaterThan(20000);
    // A .docx is a zip; every zip starts PK.
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  }, 60000);

  it('carries the document’s own title and every section heading', () => {
    const text = bodyText(base);
    expect(text).toContain('HRB Occupation');
    for (const n of [1, 2, 3, 4, 5, 7, 8]) {
      expect(text, `§${n}`).toMatch(new RegExp(`${n}\\. `));
    }
    expect(text).toContain('The register');
  });

  it('carries every register entry’s name', () => {
    const text = bodyText(base);
    for (const e of STATUTORY_TEMPLATE.filter(x => !x.supersededOn)) {
      expect(text, e.key).toContain(e.name);
    }
  });

  it('leaves no markdown syntax on the page', () => {
    const text = bodyText(base);
    expect(text).not.toContain('**');
    expect(text).not.toMatch(/^\|/m);
    expect(text).not.toMatch(/^#{1,6} /m);
  });
});

describe('the source warning', () => {
  // ⚠ The stores fall back to the shipped text deliberately. A DOCUMENT
  // assembled from it describes a higher-risk building in general and would be
  // read as describing this one.
  it('says nothing when both sources are this building’s own', () => {
    const text = bodyText(base);
    expect(text).not.toContain('DO NOT SEND IT');
  });

  it('refuses to be sent when the register fell back', () => {
    const text = bodyText({ ...base, registerSource: 'seed' });
    expect(text).toContain('DO NOT SEND IT');
    expect(text).toContain('the register');
  });

  it('refuses to be sent when the prose fell back', () => {
    const text = bodyText({ ...base, proseSource: 'seed' });
    expect(text).toContain('DO NOT SEND IT');
    expect(text).toContain('the explanatory sections');
  });

  it('names both when both fell back', () => {
    const text = bodyText({ ...base, registerSource: 'seed', proseSource: 'seed' });
    expect(text).toContain('the register and the explanatory sections');
  });
});

describe('refusals', () => {
  // ⛔ NOT caught and turned into a document. A statement short one duty is the
  // worst thing this code could produce, and it would look entirely normal.
  it('refuses rather than printing a statement with a register row missing', () => {
    const rogue = { ...STATUTORY_TEMPLATE[0], key: 'rogue_key', group: 'building_own' };
    expect(() => buildStatementDocx({ ...base, entries: [...STATUTORY_TEMPLATE, rogue] }))
      .toThrow(/no printed group/);
  });

  it('refuses without prose', () => {
    expect(() => buildStatementDocx({ ...base, prose: [] })).toThrow(/without its prose/);
  });

  it('refuses when no section holds the register’s place', () => {
    const none = STATEMENT_PROSE.map(s => ({ ...s, generated: false }));
    expect(() => buildStatementDocx({ ...base, prose: none }))
      .toThrow(/exactly one generated section/);
  });
});
