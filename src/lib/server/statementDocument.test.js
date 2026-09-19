// src/lib/server/statementDocument.test.js
//
// The whole statement, assembled from stored prose around a generated §6. R5.
//
// ⛔ BYTE-FOR-BYTE REPRODUCTION OF THE DOCUMENT IS NOT ASSERTED HERE, and that
// is deliberate rather than an omission. The statement lives in `docs/`, which
// is gitignored and does not ship, so a test in `src/` that read it would pass
// on this machine and fail on a fresh clone. `npm run check:statement-render`
// owns that comparison. What is here is everything provable from what ships.

import { describe, it, expect } from 'vitest';
import { STATEMENT_PROSE, REGISTER_SECTION_KEY, parseProse } from '$lib/utils/statementProse.js';
import { STATUTORY_TEMPLATE } from '$lib/utils/statutoryTemplate.js';
import { assembleStatement, proseOutline, sectionTitle } from './statementDocument.js';

const REGISTER = STATUTORY_TEMPLATE;

describe('the shipped prose', () => {
  it('parses into sections, exactly one of which is generated', () => {
    expect(STATEMENT_PROSE.length).toBeGreaterThan(1);
    expect(STATEMENT_PROSE.filter(s => s.generated)).toHaveLength(1);
    expect(REGISTER_SECTION_KEY).toBe('register');
  });

  it('comes back in position order, with unique keys and positions', () => {
    const pos = STATEMENT_PROSE.map(s => s.position);
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
    expect(new Set(STATEMENT_PROSE.map(s => s.key)).size).toBe(STATEMENT_PROSE.length);
    expect(new Set(pos).size).toBe(STATEMENT_PROSE.length);
  });

  it('gives every prose section a body and the generated one none', () => {
    for (const s of STATEMENT_PROSE) {
      if (s.generated) expect(s.markdown, s.key).toBe('');
      else expect(s.markdown.trim().length, s.key).toBeGreaterThan(0);
    }
  });

  // ⚠ The prose must NOT contain the register. If a copy of §6 were left in it
  // the document would carry two, and the generated one would look redundant.
  it('contains no copy of the register section', () => {
    for (const s of STATEMENT_PROSE) {
      expect(s.markdown, s.key).not.toMatch(/^## 6\. The register/m);
    }
  });
});

describe('parseProse — refusals', () => {
  const marker = (key, pos, gen) => `<!-- section: ${key} | position: ${pos}${gen ? ' | generated' : ''} -->\n`;

  it('refuses a source with no markers at all', () => {
    expect(() => parseProse('## 1. A heading\n\nSome prose.\n')).toThrow(/no section markers/);
  });

  it('refuses a duplicate key', () => {
    const src = marker('a', 10) + 'x\n' + marker('a', 20) + 'y\n' + marker('r', 30, true);
    expect(() => parseProse(src)).toThrow(/duplicate section key/);
  });

  it('refuses a duplicate position', () => {
    const src = marker('a', 10) + 'x\n' + marker('b', 10) + 'y\n' + marker('r', 30, true);
    expect(() => parseProse(src)).toThrow(/duplicate section position/);
  });

  it('refuses no generated section, and refuses two', () => {
    expect(() => parseProse(marker('a', 10) + 'x\n')).toThrow(/exactly one generated/);
    const two = marker('r1', 10, true) + marker('r2', 20, true);
    expect(() => parseProse(two)).toThrow(/exactly one generated/);
  });

  it('sorts by position, not by the order the markers appear', () => {
    const src = marker('late', 90) + 'L\n' + marker('r', 50, true) + marker('early', 10) + 'E\n';
    expect(parseProse(src).map(s => s.key)).toEqual(['early', 'r', 'late']);
  });
});

describe('assembleStatement', () => {
  const doc = assembleStatement({ prose: STATEMENT_PROSE, entries: REGISTER });

  it('puts the register into the slot the prose reserves for it', () => {
    expect(doc).toContain('## 6. The register (116)');
    // ⛔ Once, and in the right place: after §5, before §7.
    expect(doc.match(/^## 6\. The register/gm)).toHaveLength(1);
    expect(doc.indexOf('## 5.')).toBeLessThan(doc.indexOf('## 6. The register'));
    expect(doc.indexOf('## 6. The register')).toBeLessThan(doc.indexOf('## 7.'));
  });

  it('keeps every prose section, in position order', () => {
    let at = -1;
    for (const s of STATEMENT_PROSE.filter(x => !x.generated)) {
      const head = s.markdown.split('\n')[0];
      const found = doc.indexOf(head);
      expect(found, s.key).toBeGreaterThan(at);
      at = found;
    }
  });

  it('assembles the same document whatever order the sections arrive in', () => {
    const shuffled = [...STATEMENT_PROSE].reverse();
    expect(assembleStatement({ prose: shuffled, entries: REGISTER })).toBe(doc);
  });

  it('refuses without prose', () => {
    expect(() => assembleStatement({ prose: [], entries: REGISTER })).toThrow(/without its prose/);
    expect(() => assembleStatement({ entries: REGISTER })).toThrow(/without its prose/);
  });

  it('refuses when no section is the register, or more than one is', () => {
    const none = STATEMENT_PROSE.map(s => ({ ...s, generated: false }));
    expect(() => assembleStatement({ prose: none, entries: REGISTER }))
      .toThrow(/exactly one generated section, found 0/);
    const two = STATEMENT_PROSE.map(s => ({ ...s, generated: true }));
    expect(() => assembleStatement({ prose: two, entries: REGISTER }))
      .toThrow(/exactly one generated section, found/);
  });

  // ⛔ The assembler inherits the renderer's refusal, and must not swallow it.
  it('refuses rather than assembling a document with a row missing', () => {
    const rogue = { ...REGISTER[0], key: 'rogue_key', group: 'building_own' };
    expect(() => assembleStatement({ prose: STATEMENT_PROSE, entries: [...REGISTER, rogue] }))
      .toThrow(/no printed group/);
  });

  it('carries a row’s provenance through into the assembled document', () => {
    const key = REGISTER[0].key;
    const out = assembleStatement({
      prose: STATEMENT_PROSE, entries: REGISTER,
      provenance: { [key]: { origin: 'local' } },
    });
    expect(out).toContain('ADDED HERE');
  });

  // ⚠ The stamp belongs to the artefact, not the text: the same prose and the
  // same register must produce the same bytes, or the gate that is the only
  // evidence any of this is safe stops working.
  it('puts no timestamp in the markdown', () => {
    const again = assembleStatement({ prose: STATEMENT_PROSE, entries: REGISTER });
    expect(again).toBe(doc);
  });
});

describe('the outline an editor sees', () => {
  const outline = proseOutline(STATEMENT_PROSE);

  it('lists every section in order, with the register marked', () => {
    expect(outline).toHaveLength(STATEMENT_PROSE.length);
    expect(outline.filter(s => s.generated)).toHaveLength(1);
    expect(outline.map(s => s.position)).toEqual([...outline.map(s => s.position)].sort((a, b) => a - b));
  });

  it('names each section from its own first heading', () => {
    expect(sectionTitle({ generated: false, markdown: '## 2. The building\n\nText.\n' }))
      .toBe('2. The building');
    expect(sectionTitle({ generated: false, markdown: '### A sub-heading\n\nText.\n' }))
      .toBe('A sub-heading');
    expect(sectionTitle({ generated: true, markdown: '' })).toBe('6. The register');
  });

  it('falls back to the key rather than showing nothing', () => {
    expect(sectionTitle({ key: 'odd', generated: false, markdown: 'No heading here.\n' }))
      .toBe('odd');
  });

  it('counts lines, so an editor can see which sections are substantial', () => {
    for (const s of outline) {
      if (s.generated) expect(s.lines).toBe(0);
      else expect(s.lines, s.key).toBeGreaterThan(1);
    }
  });
});

describe('line endings — the fault that only shows on another machine', () => {
  // ⛔ §6 is generated in memory and is always LF. Prose arrives from a git
  // checkout under core.autocrlf and from a browser textarea, both of which
  // produce CRLF. A document carrying both fails the byte-for-byte gate and
  // puts stray carriage returns into the Word export.
  it('assembles identically whether the prose arrives LF or CRLF', () => {
    const lf = assembleStatement({ prose: STATEMENT_PROSE, entries: REGISTER });
    const crlf = STATEMENT_PROSE.map(s => ({ ...s, markdown: s.markdown.split('\n').join('\r\n') }));
    expect(assembleStatement({ prose: crlf, entries: REGISTER })).toBe(lf);
  });

  it('leaves no carriage return anywhere in the assembled document', () => {
    const crlf = STATEMENT_PROSE.map(s => ({ ...s, markdown: s.markdown.split('\n').join('\r\n') }));
    expect(assembleStatement({ prose: crlf, entries: REGISTER })).not.toContain('\r');
  });

  it('parses a CRLF seed into the same sections as an LF one', () => {
    const src = '<!-- section: a | position: 10 -->\n## A\n\nText.\n<!-- section: r | position: 20 | generated -->\n';
    expect(parseProse(src.split('\n').join('\r\n'))).toEqual(parseProse(src));
  });
});
