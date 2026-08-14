// src/lib/apps/dossier/utils/documentIndex.test.js
// P2 step 4 — filling the document index from the pack's shelf.
//
// The risk is duplication: pressing the button twice, or pressing it on an
// index the author has part-typed, must not double every row.

import { describe, it, expect } from 'vitest';
import {
  unindexedFiles, shelfIndexRows, fileLabel, describeShelfAddition,
} from './documentIndex.js';

const file = (id, name, extra = {}) => ({
  id, display_name: name, filename: `${name}.bin`,
  created_at: '2025-01-13T10:00:00.000Z', ...extra,
});

describe('fileLabel', () => {
  it('prefers the display name, falls back to the filename', () => {
    expect(fileLabel(file('f1', 'Section 20 notice'))).toBe('Section 20 notice');
    expect(fileLabel({ filename: 'scan001.pdf' })).toBe('scan001.pdf');
    expect(fileLabel(null)).toBe('Untitled file');
  });
});

describe('unindexedFiles', () => {
  const files = [file('f1', 'Notice'), file('f2', 'Survey'), file('f3', 'Invoice')];

  it('returns every file for an empty index', () => {
    expect(unindexedFiles(files, []).map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
  });

  it('skips a file a row already links to', () => {
    const records = [{ id: 'r1', document_id: 'f2', fields: { name: 'anything' } }];
    expect(unindexedFiles(files, records).map(f => f.id)).toEqual(['f1', 'f3']);
  });

  it('skips a file the author already typed in by hand', () => {
    // Without this, one press on a part-typed index duplicates the rows they
    // had already entered.
    const records = [{ id: 'r1', document_id: null, fields: { name: 'notice' } }];
    expect(unindexedFiles(files, records).map(f => f.id)).toEqual(['f2', 'f3']);
  });

  it('is idempotent — pressing twice adds nothing the second time', () => {
    const first = unindexedFiles(files, []);
    const records = shelfIndexRows(first).map((r, i) => ({ id: `r${i}`, ...r }));
    expect(unindexedFiles(files, records)).toEqual([]);
  });

  it('ignores a blank name rather than treating it as a match', () => {
    const records = [{ id: 'r1', document_id: null, fields: { name: '   ' } }];
    expect(unindexedFiles(files, records)).toHaveLength(3);
  });
});

describe('shelfIndexRows', () => {
  it('carries the name, the upload date and the description', () => {
    const [row] = shelfIndexRows([file('f1', 'Notice', { description: 'Served by post' })]);

    expect(row.document_id).toBe('f1');
    expect(row.fields.name).toBe('Notice');
    expect(row.fields.date).toBe('2025-01-13');
    expect(row.fields.notes).toBe('Served by post');
  });

  it('leaves author EMPTY — the file records who uploaded it, not who wrote it', () => {
    // A plausible-looking wrong answer in a solicitor's pack is worse than a
    // blank.
    expect(shelfIndexRows([file('f1', 'Notice')])[0].fields.author).toBe('');
  });

  it('produces every field the template defines, and only those', () => {
    // Status was removed from the template; a row built here must not carry a
    // key the template no longer knows about.
    expect(Object.keys(shelfIndexRows([file('f1', 'N')])[0].fields).sort())
      .toEqual(['author', 'date', 'name', 'notes']);
  });

  it('leaves the date empty when there is no usable timestamp', () => {
    expect(shelfIndexRows([file('f1', 'N', { created_at: null })])[0].fields.date).toBe('');
    expect(shelfIndexRows([file('f1', 'N', { created_at: 'nonsense' })])[0].fields.date).toBe('');
  });

  it('formats the date in local time, not UTC', () => {
    // A late-evening BST upload must not index as the previous day.
    const row = shelfIndexRows([file('f1', 'N', {
      created_at: new Date(2025, 6, 14, 23, 30).toISOString(),
    })])[0];
    expect(row.fields.date).toBe('2025-07-14');
  });
});

describe('describeShelfAddition', () => {
  it('counts what would be added', () => {
    expect(describeShelfAddition([{}, {}, {}])).toBe('Add 3 files from the shelf');
    expect(describeShelfAddition([{}])).toBe('Add 1 file from the shelf');
  });

  it('says nothing when there is nothing to add', () => {
    expect(describeShelfAddition([])).toBe('');
  });
});
