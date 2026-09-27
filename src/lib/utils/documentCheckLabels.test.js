// src/lib/utils/documentCheckLabels.test.js
// What Check files found, in words. ⛔ The rule that matters: an answer that is
// not a clear "found" is never shown as fine.
import { describe, it, expect } from 'vitest';
import { checkProblems, checkSummary, FILE_PROBLEM } from './documentCheckLabels.js';

describe('checkProblems', () => {
  it('finds nothing wrong when the record and the file are both there, or it is a loose upload', () => {
    expect(checkProblems({ owner: 'present', file: 'present' })).toEqual([]);
    expect(checkProblems({ owner: 'loose', file: 'present' })).toEqual([]);
  });

  it('names a deleted record and a missing file, in red', () => {
    const p = checkProblems({ owner: 'missing', file: 'missing' });
    expect(p.map((x) => x.kind)).toEqual(['owner', 'file']);
    expect(p.every((x) => x.tone === 'red')).toBe(true);
  });

  it('flags every file answer other than present', () => {
    for (const status of Object.keys(FILE_PROBLEM)) {
      expect(checkProblems({ owner: 'present', file: status })).toHaveLength(1);
    }
  });

  it('never treats an answer it does not know as a pass', () => {
    expect(checkProblems({ owner: 'present', file: 'something_new' })).toHaveLength(1);
    expect(checkProblems({ owner: 'something_new', file: 'present' })).toHaveLength(1);
  });

  it('carries the reason a file could not be checked', () => {
    expect(checkProblems({ owner: 'present', file: 'error', fileDetail: 'quota' })[0].detail).toBe('quota');
  });
});

describe('checkSummary', () => {
  it('counts fine, problem and not-checked rows separately', () => {
    const docs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const s = checkSummary(docs, {
      a: { owner: 'present', file: 'present' },
      b: { owner: 'missing', file: 'missing' },
      c: { owner: 'present', file: 'unchecked' },
    });
    expect(s).toMatchObject({ checked: 3, fine: 1, withProblems: 2, notChecked: 1 });
    expect(s.byLabel.map((x) => x.count).reduce((a, b) => a + b)).toBe(3);
  });

  // A row loaded after the check has had no check, whatever else is fine.
  it('counts a row without a result as not checked, never as fine', () => {
    expect(checkSummary([{ id: 'new' }], {})).toMatchObject({ checked: 0, fine: 0, notChecked: 1 });
  });
});
