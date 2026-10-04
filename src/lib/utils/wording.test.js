// src/lib/utils/wording.test.js
// The wording is an admin setting (Admin → Other Config → Wording, 2026-10-04).
// Pins: what ships is in force until an admin changes it, only changes are
// stored, a text with a token it does not understand is refused, the letter
// rules (an empty token drops its paragraph, an emptied heading goes), and that
// no copy of the wording survives anywhere else in the code.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  wordingInfo, validateWording, cleanWording, setWording, wordingText, wording,
  letterBlocks, tokensIn,
} from './wording.js';

afterEach(() => setWording(null));

describe('the shipped wording', () => {
  it('uses only the tokens each entry declares', () => {
    const all = Object.fromEntries(wordingInfo().map((d) => [d.key, d.default]));
    expect(validateWording(all)).toEqual({});
  });

  it('is in force until an admin changes it, and only changes are stored', () => {
    expect(wordingText('dossierConfidentialityNotice')).toMatch(/^This document package contains/);
    const d = wordingInfo().find((x) => x.key === 'dossierConfidentialityNotice');
    expect(cleanWording({ dossierConfidentialityNotice: d?.default, morBsrReferencePending: 'To follow.' }))
      .toEqual({ morBsrReferencePending: 'To follow.' });
    setWording({ morBsrReferencePending: 'To follow.' });
    expect(wording('morBsrReferencePending')).toBe('To follow.');
  });
});

describe('a text an admin writes', () => {
  it('is refused when it uses a token the text does not understand', () => {
    const p = validateWording({ morReporterHolding: 'Hello {bulding}, {status}.' });
    expect(p.morReporterHolding).toMatch(/\{bulding\}/);
    expect(validateWording({ dossierConfidentialityNotice: 'Private to {building}.' }).dossierConfidentialityNotice)
      .toMatch(/no \{tokens\}/);
  });

  it('is refused when empty — the default is how to go back', () => {
    expect(validateWording({ dossierConfidentialityNotice: '   ' }).dossierConfidentialityNotice).toBeTruthy();
  });

  it('a stored text that has become invalid is not put in force', () => {
    setWording({ morReporterHolding: 'Hello {bulding}' });
    expect(wordingText('morReporterHolding')).toMatch(/^# \{building\}/);
  });

  it('a Windows line ending is not a change', () => {
    const d = wordingInfo().find((x) => x.key === 'morReporterBsr');
    expect(cleanWording({ morReporterBsr: d?.default.replace(/\n/g, '\r\n') })).toEqual({});
  });
});

describe('letters', () => {
  const text = '# {building} — Update\n\nIntro.\n\n## Lessons learned\n\n{lessons_learned}\n\n## Next\n\nMore at {building}.\n\n**In bold**';

  it('take the title, headings, paragraphs and bold lines from the text', () => {
    const { title, blocks } = letterBlocks(text, { building: 'Riverside Court', lessons_learned: 'Check doors.' });
    expect(title).toBe('Riverside Court — Update');
    expect(blocks).toEqual([
      { kind: 'para', text: 'Intro.' },
      { kind: 'heading', text: 'Lessons learned' },
      { kind: 'para', text: 'Check doors.' },
      { kind: 'heading', text: 'Next' },
      { kind: 'para', text: 'More at Riverside Court.' },
      { kind: 'bold', text: 'In bold' },
    ]);
  });

  it('leave out a paragraph whose token is empty, and the heading left with nothing', () => {
    const { blocks } = letterBlocks(text, { building: 'Riverside Court', lessons_learned: '' });
    expect(blocks.map((b) => b.text)).not.toContain('Lessons learned');
    expect(blocks.map((b) => b.text)).toContain('Next');
  });

  it('lines in one paragraph are joined into one', () => {
    expect(letterBlocks('First line\nsecond line', {}).blocks).toEqual([{ kind: 'para', text: 'First line second line' }]);
  });
});

describe('read when used, and one copy', () => {
  const root = join(process.cwd(), 'src');
  /** @param {string} d @param {string[]} [o] */
  const walk = (d, o = []) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, o);
      else if (/\.(js|svelte)$/.test(n) && !/\.test\.js$/.test(n)) o.push(p);
    }
    return o;
  };
  const files = walk(root).map((p) => ({ rel: relative(root, p).replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }));

  it('no file captures wording at module scope', () => {
    const bad = files.filter((f) => /^(export )?const \w+\s*=\s*(wording|wordingText)\(/m.test(f.src)).map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it('no shipped sentence is written anywhere else in the code', () => {
    // A recognisable line from each entry: a copy elsewhere is a second copy
    // that an admin's change would not reach.
    for (const d of wordingInfo()) {
      const line = d.default.split('\n').map((l) => l.replace(/^#+\s*/, '').trim())
        .filter((l) => l.length > 40 && !tokensIn(l).length)[0] ?? d.default;
      const probe = line.slice(0, 60);
      const copies = files.filter((f) => f.rel !== 'lib/utils/wording.js' && f.src.includes(probe)).map((f) => f.rel);
      expect(copies, `${d.key}: "${probe}"`).toEqual([]);
    }
  });

  it('every entry is read somewhere', () => {
    const code = files.filter((f) => f.rel !== 'lib/utils/wording.js').map((f) => f.src).join('\n');
    expect(wordingInfo().filter((d) => !code.includes(`'${d.key}'`)).map((d) => d.key)).toEqual([]);
  });
});
