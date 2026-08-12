// src/lib/apps/dossier/utils/sheetPreview.test.js
// P2 step 4 — spreadsheet previews.
//
// The grid arrives from exceljs, whose cell values are a small union of objects
// rather than primitives. Rendering "[object Object]" into a solicitor's
// briefing pack is precisely the failure spec 2 warned about, so formatCell()
// gets every shape exercised.

import { describe, it, expect } from 'vitest';
import {
  formatCell, buildSheetPreview, parseCsv, describeSheetPreview,
  renderSheetPreviewHtml, isSheetMime, MAX_CELL_CHARS,
} from './sheetPreview.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

describe('isSheetMime', () => {
  it('recognises the spreadsheet types', () => {
    expect(isSheetMime('text/csv')).toBe(true);
    expect(isSheetMime(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    expect(isSheetMime('application/vnd.oasis.opendocument.spreadsheet')).toBe(true);
  });

  it('falls back to the extension, because uploads arrive as octet-stream', () => {
    expect(isSheetMime('application/octet-stream', 'Schedule of works.xlsx')).toBe(true);
    expect(isSheetMime('', 'export.CSV')).toBe(true);
  });

  it('says no to everything else', () => {
    expect(isSheetMime('application/pdf', 'notice.pdf')).toBe(false);
    expect(isSheetMime('image/png', 'plan.png')).toBe(false);
    expect(isSheetMime(null, null)).toBe(false);
  });
});

describe('formatCell', () => {
  it('passes primitives through', () => {
    expect(formatCell('Roof works')).toBe('Roof works');
    expect(formatCell(1420.5)).toBe('1420.5');
    expect(formatCell(0)).toBe('0');           // not blanked as falsy
    expect(formatCell(true)).toBe('TRUE');
  });

  it('renders a formula as its result, not its source', () => {
    expect(formatCell({ formula: 'SUM(B2:B40)', result: 8400 })).toBe('8400');
  });

  it('renders a formula error as the error code', () => {
    expect(formatCell({ error: '#REF!' })).toBe('#REF!');
    expect(formatCell({ formula: 'A1/0', result: { error: '#DIV/0!' } })).toBe('#DIV/0!');
  });

  it('flattens rich text', () => {
    expect(formatCell({ richText: [{ text: 'Section ' }, { text: '20' }] })).toBe('Section 20');
  });

  it('shows a hyperlink cell as its text', () => {
    expect(formatCell({ text: 'The notice', hyperlink: 'https://example.com' }))
      .toBe('The notice');
  });

  it('formats a date without a timezone shift', () => {
    // Constructed in local time. toISOString() would move a BST date back a day
    // — the bug the capital plan hit.
    expect(formatCell(new Date(2025, 6, 14))).toBe('2025-07-14');
  });

  it('keeps the time when there is one', () => {
    expect(formatCell(new Date(2025, 0, 14, 9, 5))).toBe('2025-01-14 09:05');
  });

  it('gives an empty cell for null and for a shape it does not know', () => {
    expect(formatCell(null)).toBe('');
    expect(formatCell(undefined)).toBe('');
    expect(formatCell({ somethingElse: 1 })).toBe('');
  });
});

describe('buildSheetPreview', () => {
  const grid = [
    ['Document', 'Date', 'Author'],
    ['Section 20 notice', new Date(2025, 0, 13), 'Managing agent'],
    ['Fire risk assessment', new Date(2024, 10, 2), 'Consultant'],
  ];

  it('takes the first row as the header', () => {
    const preview = buildSheetPreview(grid);
    expect(preview.columns).toEqual(['Document', 'Date', 'Author']);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toEqual(['Section 20 notice', '2025-01-13', 'Managing agent']);
  });

  it('counts rows excluding the header', () => {
    expect(buildSheetPreview(grid).totalRows).toBe(2);
    expect(buildSheetPreview(grid).truncated).toBe(false);
  });

  it('caps the rows and says it did', () => {
    const long = [['A'], ...Array.from({ length: 400 }, (_, i) => [`row ${i}`])];
    const preview = buildSheetPreview(long, { maxRows: 12 });

    expect(preview.rows).toHaveLength(12);
    expect(preview.totalRows).toBe(400);
    expect(preview.truncated).toBe(true);
  });

  it('caps the columns and says it did', () => {
    const wide = [Array.from({ length: 30 }, (_, i) => `c${i}`), Array(30).fill('x')];
    const preview = buildSheetPreview(wide, { maxColumns: 8 });

    expect(preview.columns).toHaveLength(8);
    expect(preview.rows[0]).toHaveLength(8);
    expect(preview.totalColumns).toBe(30);
    expect(preview.truncated).toBe(true);
  });

  it('drops trailing empty rows and columns', () => {
    // exceljs reports dimensions from FORMATTING, so a file routinely claims
    // columns and rows nobody ever typed in.
    const padded = [
      ['Document', 'Date', '', '', ''],
      ['Notice', '2025-01-13', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
    ];
    const preview = buildSheetPreview(padded);

    expect(preview.columns).toEqual(['Document', 'Date']);
    expect(preview.rows).toEqual([['Notice', '2025-01-13']]);
    expect(preview.totalRows).toBe(1);
    expect(preview.truncated).toBe(false);
  });

  it('clips a very long cell', () => {
    const preview = buildSheetPreview([['A'], ['y'.repeat(500)]]);
    expect(preview.rows[0][0].length).toBe(MAX_CELL_CHARS + 1);   // + the ellipsis
    expect(preview.rows[0][0].endsWith('…')).toBe(true);
  });

  it('collapses newlines inside a cell, so one cell stays one line', () => {
    expect(buildSheetPreview([['A'], ['one\ntwo']]).rows[0][0]).toBe('one two');
  });

  it('reports an empty sheet as empty rather than throwing', () => {
    for (const empty of [[], [[]], [['', '']], null]) {
      const preview = buildSheetPreview(empty);
      expect(preview.columns).toEqual([]);
      expect(preview.rows).toEqual([]);
    }
  });

  it('pads a short row so every row has the same width', () => {
    const ragged = [['A', 'B', 'C'], ['only one']];
    expect(buildSheetPreview(ragged).rows[0]).toEqual(['only one', '', '']);
  });
});

describe('parseCsv', () => {
  it('parses a plain file', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles quoted commas and quoted newlines', () => {
    expect(parseCsv('a,b\n"one, two","line\nbreak"'))
      .toEqual([['a', 'b'], ['one, two', 'line\nbreak']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hello"""')).toEqual([['a'], ['say "hello"']]);
  });

  it('handles CRLF and a UTF-8 BOM — both of which Excel writes', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2'], ['']]);
  });

  it('keeps empty cells rather than collapsing them', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   ')).toEqual([]);
  });
});

describe('describeSheetPreview', () => {
  it('states the size plainly when nothing is hidden', () => {
    expect(describeSheetPreview(buildSheetPreview([['A'], ['1'], ['2']])))
      .toBe('2 rows.');
  });

  it('says what is NOT shown when the preview is a window', () => {
    const long = [['A'], ...Array.from({ length: 400 }, (_, i) => [`r${i}`])];
    const line = describeSheetPreview(buildSheetPreview(long, { maxRows: 12 }));

    // A reader who cannot tell a window from a whole file may draw a conclusion
    // the spreadsheet does not support.
    expect(line).toContain('12 of 400 rows');
    expect(line).toContain('Open the file');
  });

  it('mentions hidden columns too', () => {
    const wide = [Array.from({ length: 30 }, (_, i) => `c${i}`), Array(30).fill('x')];
    expect(describeSheetPreview(buildSheetPreview(wide, { maxColumns: 8 })))
      .toContain('8 of 30 columns');
  });

  it('names the sheet it came from', () => {
    expect(describeSheetPreview(buildSheetPreview([['A'], ['1']], { sheetName: 'Costs' })))
      .toContain('Costs');
  });

  it('says so when the file is empty', () => {
    expect(describeSheetPreview(buildSheetPreview([]))).toContain('empty');
  });
});

describe('renderSheetPreviewHtml', () => {
  it('renders a table with a header, a body and the note', () => {
    const html = renderSheetPreviewHtml(
      buildSheetPreview([['Document', 'Date'], ['Notice', '2025-01-13']]), esc);

    expect(html).toContain('<th>Document</th>');
    expect(html).toContain('<td>Notice</td>');
    expect(html).toContain('dossier-sheet-note');
  });

  it('escapes cell text through the caller-s escaper', () => {
    const html = renderSheetPreviewHtml(
      buildSheetPreview([['A'], ['<script>alert(1)</script>']]), esc);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script');
  });

  it('renders nothing for an empty preview, so the caller falls back to a card', () => {
    expect(renderSheetPreviewHtml(buildSheetPreview([]), esc)).toBe('');
    expect(renderSheetPreviewHtml(null, esc)).toBe('');
  });
});
