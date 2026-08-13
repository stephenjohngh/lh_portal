// src/lib/apps/dossier/utils/sheetPreview.js
// Showing a spreadsheet inside a page — pure, Type-1 testable, no DOM and no
// exceljs. The server route feeds this a plain grid; everything that decides
// what a preview looks like lives here so it can be tested in the node env.
//
// A preview is deliberately NOT the file. It is a bounded window — a dozen rows
// — with a line saying how much was left out and a link to the real thing. A
// disclosure bundle's spreadsheet runs to thousands of rows, and a page that
// tried to show all of it would be unreadable and would bloat the stored JSON
// it is snapshotted into.

/**
 * How much of a sheet a preview holds, by default.
 *
 * Bounds the stored snapshot, not just the view — the rows travel in the block
 * and again in every revision of the page, so this is a storage decision as
 * much as a layout one.
 */
export const MAX_PREVIEW_ROWS = 12;

/**
 * The range an author may choose from.
 *
 * A schedule of works wants more than a summary table does, and only the author
 * knows which this is — so it is a number they type, not a short list of
 * guesses. Bounded at both ends: nought rows is not a preview, and past forty a
 * preview has stopped being one, with the file itself one click away.
 */
export const MIN_PREVIEW_ROWS = 1;
export const ROW_LIMIT = 40;

/**
 * Coerce a requested row count into the range we will actually serve.
 *
 * Clamps rather than rejects: an author who types 90 wants "as much as you
 * will give me", and answering with the default 12 would be perverse. Anything
 * that is not a number at all falls back to the default, because that is a
 * malformed request rather than an opinion.
 */
export function normalisePreviewRows(rows) {
  // Absent is not zero. `Number(null)` is 0 and `Number('')` is 0, and
  // URLSearchParams.get() returns null for a parameter nobody sent — so
  // without this guard every request that simply omitted the count would clamp
  // to the minimum and show a single row.
  if (rows == null || rows === '') return MAX_PREVIEW_ROWS;

  const n = Number(rows);
  if (!Number.isFinite(n)) return MAX_PREVIEW_ROWS;
  return Math.min(Math.max(Math.trunc(n), MIN_PREVIEW_ROWS), ROW_LIMIT);
}
export const MAX_PREVIEW_COLS = 8;
/** Long cells are clipped: a preview table with a 2,000-character cell is not a preview. */
export const MAX_CELL_CHARS = 120;

/** Mime types this app will try to preview as a grid. */
const SHEET_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

/**
 * True when a file is worth asking the server for a grid preview.
 * @param {string|null} [mimeType]
 * @param {string|null} [filename] - checked as a fallback; uploads often arrive as octet-stream
 */
export function isSheetMime(mimeType, filename = '') {
  const mime = String(mimeType ?? '').toLowerCase().trim();
  if (SHEET_MIMES.has(mime)) return true;
  return /\.(csv|xlsx|xlsm|xls|ods)$/i.test(String(filename ?? '').trim());
}

/** Local Y-M-D. Never via toISOString: that shifts a BST date back a day. */
function ymd(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * One cell's value as display text.
 *
 * exceljs hands back a small union rather than a primitive — formulas, rich
 * text, hyperlinks and errors all arrive as objects. Rendering `[object Object]`
 * into a solicitor's briefing pack is exactly the kind of failure spec 2 warned
 * about, so every shape is handled explicitly and anything unrecognised becomes
 * an empty cell rather than a guess.
 *
 * @param {any} value
 * @returns {string}
 */
export function formatCell(value) {
  if (value == null) return '';

  if (value instanceof Date) {
    // Midnight is a date; anything else is a timestamp and the time matters.
    const hasTime = value.getHours() || value.getMinutes() || value.getSeconds();
    return hasTime
      ? `${ymd(value)} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
      : ymd(value);
  }

  if (typeof value === 'object') {
    // A formula shows its RESULT — the author's reader wants the number, not
    // "=SUM(B2:B40)". The formula itself is in the file if anyone needs it.
    if ('result' in value)    return formatCell(value.result);
    if ('error' in value)     return String(value.error);
    if ('richText' in value)  return (value.richText ?? []).map(r => r?.text ?? '').join('');
    if ('text' in value)      return String(value.text);
    if ('hyperlink' in value) return String(value.hyperlink);
    return '';
  }

  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

/** Clip a cell for display, marking that it was clipped. */
function clip(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_CELL_CHARS ? `${flat.slice(0, MAX_CELL_CHARS).trimEnd()}…` : flat;
}

/**
 * Turn a raw grid into a bounded preview.
 *
 * The first row becomes the header — true of essentially every spreadsheet used
 * as a document index or schedule, and a wrong guess here is cosmetic. Trailing
 * empty rows and columns are dropped first: exceljs reports a sheet's dimensions
 * from formatting, so a file often claims 40 columns and uses 5.
 *
 * @param {any[][]} grid - rows of raw cell values
 * @param {{ sheetName?: string, maxRows?: number, maxColumns?: number }} [opts]
 * @returns {{ sheetName: string, columns: string[], rows: string[][],
 *             totalRows: number, totalColumns: number, truncated: boolean }}
 */
export function buildSheetPreview(grid = [], opts = {}) {
  const maxRows = opts.maxRows ?? MAX_PREVIEW_ROWS;
  const maxCols = opts.maxColumns ?? MAX_PREVIEW_COLS;

  const text = (grid ?? []).map(row => (row ?? []).map(cell => clip(formatCell(cell))));

  // Drop trailing empty rows, then trailing empty columns.
  let lastRow = -1;
  for (let i = 0; i < text.length; i++) if (text[i].some(Boolean)) lastRow = i;
  const rows = text.slice(0, lastRow + 1);

  let width = 0;
  for (const row of rows) {
    for (let c = row.length - 1; c >= 0; c--) {
      if (row[c]) { width = Math.max(width, c + 1); break; }
    }
  }

  const totalRows = Math.max(rows.length - 1, 0);   // excluding the header
  const totalColumns = width;

  if (!rows.length || !width) {
    return {
      sheetName: opts.sheetName ?? '',
      columns: [], rows: [], totalRows: 0, totalColumns: 0, truncated: false,
    };
  }

  const take = row => Array.from({ length: Math.min(width, maxCols) }, (_, c) => row[c] ?? '');

  const columns = take(rows[0]);
  const body = rows.slice(1, 1 + maxRows).map(take);

  return {
    sheetName: opts.sheetName ?? '',
    columns,
    rows: body,
    totalRows,
    totalColumns,
    truncated: totalRows > body.length || totalColumns > columns.length,
  };
}

/**
 * Parse CSV to a grid.
 *
 * Hand-rolled rather than pulled in as a dependency: the format is small, and
 * RFC 4180's quoting — doubled quotes, embedded commas, embedded newlines — is
 * the whole of it. Handles CRLF and a UTF-8 BOM, both of which every real export
 * from Excel carries.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const source = String(text ?? '').replace(/^﻿/, '');
  if (!source.trim()) return [];

  const grid = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }   // an escaped quote
        else quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"')  { quoted = true; continue; }
    if (ch === ',')  { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;                              // CRLF
    if (ch === '\n') { row.push(cell); grid.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }

  row.push(cell);
  grid.push(row);
  return grid;
}

/**
 * One line saying what the preview is showing and — the part that matters —
 * what it is not. A reader who cannot tell a 12-row window from a 12-row file
 * may draw a conclusion the spreadsheet does not support.
 */
export function describeSheetPreview(preview) {
  if (!preview || !preview.columns?.length) return 'This spreadsheet appears to be empty.';

  const where = preview.sheetName ? ` from “${preview.sheetName}”` : '';

  if (!preview.truncated) {
    return `${preview.totalRows} row${preview.totalRows === 1 ? '' : 's'}${where}.`;
  }

  const parts = [`${preview.rows.length} of ${preview.totalRows} rows`];
  if (preview.totalColumns > preview.columns.length) {
    parts.push(`${preview.columns.length} of ${preview.totalColumns} columns`);
  }
  return `Showing ${parts.join(', ')}${where}. Open the file for the rest.`;
}

/**
 * Render a preview as a table — the ONE definition, used by the editor's node
 * view and by the read-only renderer alike (merge doc D10).
 *
 * @param {object|null} preview
 * @param {(s: any) => string} escape - the caller's HTML escaper
 */
export function renderSheetPreviewHtml(preview, escape) {
  if (!preview?.columns?.length) return '';

  const head = preview.columns
    .map(label => `<th>${escape(label)}</th>`).join('');
  const body = preview.rows
    .map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`)
    .join('');

  return '<div class="dossier-sheet">'
    + `<table class="dossier-sheet-table"><thead><tr>${head}</tr></thead>`
    + `<tbody>${body}</tbody></table>`
    + `<div class="dossier-sheet-note">${escape(describeSheetPreview(preview))}</div>`
    + '</div>';
}
