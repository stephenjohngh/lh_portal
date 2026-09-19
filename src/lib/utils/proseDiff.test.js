// src/lib/utils/proseDiff.test.js
//
// What a re-import of the shipped written sections would do.
//
// ⛔ THE CASE THAT MOTIVATED THIS IS THE FIRST DESCRIBE. R5's import only ADDED,
// so a corrected §3 or §4 shipped in a later release was silently declined and
// the only sign was that the two texts quietly disagreed — word for word the
// fault R3 fixed for the register.

import { describe, it, expect } from 'vitest';
import { STATEMENT_PROSE } from '$lib/utils/statementProse.js';
import {
  diffProse, sectionChanges, lineDelta, titleOf, describeProseDiff,
} from './proseDiff.js';

/** A held section, as the store shapes it. */
const held = (section, provenance = { origin: 'seed', seedModifiedAt: null }) =>
  ({ section, provenance });

const S = (key, position, markdown, generated = false) => ({ key, position, generated, markdown });

describe('a correction in the shipped text is no longer declined in silence', () => {
  const here = [held(S('s3', 30, '## 3. A heading\n\nThe old wording.\n'))];
  const shipped = [S('s3', 30, '## 3. A heading\n\nThe corrected wording.\n')];

  it('reports it as updatable when nobody has edited it here', () => {
    const d = diffProse(shipped, here);
    expect(d.updatable.map(r => r.key)).toEqual(['s3']);
    expect(d.divergent).toEqual([]);
    expect(d.hasAnything).toBe(true);
  });

  it('reports it as DIVERGENT when somebody has edited it here', () => {
    const edited = [held(here[0].section, { origin: 'seed', seedModifiedAt: '2026-09-19T10:00:00Z' })];
    const d = diffProse(shipped, edited);
    expect(d.divergent.map(r => r.key)).toEqual(['s3']);
    expect(d.updatable).toEqual([]);
    expect(d.divergent[0].seedModifiedAt).toBe('2026-09-19T10:00:00Z');
  });

  // ⭐ The whole basis of the categories: we hold the CURRENT shipped text and
  // the CURRENT row, never the text as it was at import. Only the stamp
  // distinguishes "the shipped text moved" from "somebody rewrote this here".
  it('uses the stamp, and nothing else, to tell the two apart', () => {
    const a = diffProse(shipped, here);
    const b = diffProse(shipped, [held(here[0].section, { seedModifiedAt: '2026-01-01T00:00:00Z' })]);
    expect(a.updatable).toHaveLength(1);
    expect(b.updatable).toHaveLength(0);
    expect(b.divergent).toHaveLength(1);
  });
});

describe('the categories', () => {
  const shipped = [
    S('a', 10, '## A\n\nOne.\n'),
    S('b', 20, '## B\n\nTwo.\n'),
    S('r', 30, '', true),
  ];

  it('reports a section the shipped text has and this building does not', () => {
    const d = diffProse(shipped, [held(shipped[0]), held(shipped[2])]);
    expect(d.added.map(s => s.key)).toEqual(['b']);
  });

  it('reports nothing for sections that match', () => {
    const d = diffProse(shipped, shipped.map(s => held(s)));
    expect(d.unchanged.sort()).toEqual(['a', 'b', 'r']);
    expect(d.hasAnything).toBe(false);
  });

  it('leaves a locally added section alone, and does not call it "something to do"', () => {
    const d = diffProse(shipped, [
      ...shipped.map(s => held(s)),
      held(S('local', 95, '## Ours\n\nAdded here.\n'), { origin: 'local', seedModifiedAt: null }),
    ]);
    expect(d.localOnly.map(r => r.key)).toEqual(['local']);
    expect(d.hasAnything).toBe(false);
  });

  // ⚠ Surfaced, never acted on. Removing a section of the statement is a
  // decision about a reviewed document, not a side effect of pressing import.
  it('surfaces a seeded section the shipped text no longer carries', () => {
    const d = diffProse(shipped, [
      ...shipped.map(s => held(s)),
      held(S('gone', 85, '## Retired\n\nWas shipped once.\n')),
    ]);
    expect(d.withdrawn.map(r => r.key)).toEqual(['gone']);
    expect(d.hasAnything).toBe(true);
  });
});

describe('what counts as a change', () => {
  // ⚠ A position change reorders the document while every word stays identical,
  // so a line count would report nothing at all.
  it('notices a section that moves without its text changing', () => {
    const changes = sectionChanges(S('a', 15, '## A\n\nSame.\n'), S('a', 10, '## A\n\nSame.\n'));
    expect(changes.map(c => c.field)).toEqual(['position']);
    expect(changes[0]).toMatchObject({ seed: 15, here: 10 });
  });

  it('notices which section holds the register’s slot', () => {
    const changes = sectionChanges(S('r', 30, '', true), S('r', 30, '', false));
    expect(changes.map(c => c.field)).toEqual(['generated']);
  });

  it('notices the markdown', () => {
    expect(sectionChanges(S('a', 10, 'x\n'), S('a', 10, 'y\n')).map(c => c.field))
      .toEqual(['markdown']);
  });

  // ⛔ §6 is generated in memory and is always LF; stored prose may arrive CRLF
  // from a browser textarea. A line ending is not an edit.
  it('does not call a line ending a change', () => {
    const lf = S('a', 10, '## A\n\nOne.\nTwo.\n');
    const crlf = S('a', 10, '## A\r\n\r\nOne.\r\nTwo.\r\n');
    expect(sectionChanges(lf, crlf)).toEqual([]);
    expect(diffProse([lf], [held(crlf)]).unchanged).toEqual(['a']);
  });
});

describe('lineDelta — enough to decide whether to look', () => {
  it('counts lines added and removed', () => {
    expect(lineDelta('a\nb\n', 'a\nb\nc\n')).toEqual({ added: 1, removed: 0 });
    expect(lineDelta('a\nb\nc\n', 'a\nc\n')).toEqual({ added: 0, removed: 1 });
    expect(lineDelta('a\nb\n', 'a\nx\n')).toEqual({ added: 1, removed: 1 });
  });

  it('reports nothing for identical text, whatever its line endings', () => {
    expect(lineDelta('a\nb\n', 'a\r\nb\r\n')).toEqual({ added: 0, removed: 0 });
  });
});

describe('titles and the summary line', () => {
  it('takes a title from the section’s own first heading', () => {
    expect(titleOf(S('s2', 30, '## 2. The building\n\nText.\n'))).toBe('2. The building');
    expect(titleOf(S('r', 70, '', true))).toBe('6. The register');
    expect(titleOf(S('odd', 10, 'No heading.\n'))).toBe('odd');
  });

  it('says plainly when there is nothing to do', () => {
    const d = diffProse(STATEMENT_PROSE, STATEMENT_PROSE.map(s => held(s)));
    expect(describeProseDiff(d)).toMatch(/match the shipped text/);
  });

  it('names what is there when there is', () => {
    const d = diffProse(
      [S('a', 10, 'new\n'), S('b', 20, 'changed\n')],
      [held(S('b', 20, 'original\n'))],
    );
    expect(describeProseDiff(d)).toContain('1 new');
    expect(describeProseDiff(d)).toContain('1 updated in the shipped text');
  });
});

describe('the shipped prose against itself', () => {
  // ⭐ The decisive case, as with the register's rules: the text that ships must
  // produce no diff against itself, or the check is wrong rather than the text.
  it('produces no diff', () => {
    const d = diffProse(STATEMENT_PROSE, STATEMENT_PROSE.map(s => held(s)));
    expect(d.hasAnything).toBe(false);
    expect(d.unchanged).toHaveLength(STATEMENT_PROSE.length);
  });

  it('reports every section as new against an empty building', () => {
    const d = diffProse(STATEMENT_PROSE, []);
    expect(d.added).toHaveLength(STATEMENT_PROSE.length);
    expect(d.hasAnything).toBe(true);
  });
});
