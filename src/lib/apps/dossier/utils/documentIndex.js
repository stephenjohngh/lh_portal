// src/lib/apps/dossier/utils/documentIndex.js
// Filling the document index from the pack's shelf — pure, Type-1 testable.
//
// Every file in the index is already on the shelf, with its name and its upload
// date recorded. Making the author retype all of it is the kind of clerical
// work that gets skipped, and a half-typed index is worse than none.
//
// What is deliberately NOT derived: `status`. Disclosed / Withheld / Requested
// / Missing is a legal judgement about a document, not a fact about a file, and
// guessing it would put a claim in a solicitor's pack that nobody made.

import { coerceRecordFields } from './datasetTemplates.js';

/** Local Y-M-D from a timestamp. Never toISOString — that shifts a BST date back a day. */
function ymd(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A file's name as the index should show it. */
export function fileLabel(file) {
  return file?.display_name || file?.filename || 'Untitled file';
}

/**
 * Which shelf files are not yet in the index.
 *
 * Matched on `document_id` — the row's actual reference — and falling back to
 * the name for rows typed by hand before the file was linked. Without that
 * fallback, using this button once on a part-typed index would duplicate every
 * row the author had already entered.
 *
 * @param {object[]} files   - document_library rows on the shelf
 * @param {object[]} records - the index's existing rows
 * @returns {object[]} files, in shelf order
 */
export function unindexedFiles(files = [], records = []) {
  const linked = new Set(records.map(r => r.document_id).filter(Boolean));
  const named  = new Set(records
    .map(r => String(r?.fields?.name ?? '').trim().toLowerCase())
    .filter(Boolean));

  return files.filter(file =>
    !linked.has(file.id) && !named.has(fileLabel(file).trim().toLowerCase()));
}

/**
 * Index rows for a set of shelf files.
 *
 * Returns `{ fields, document_id }` pairs — the document_id makes each row open
 * the file it describes, which is the whole point of an index.
 *
 * @param {object[]} files
 * @returns {{ fields: object, document_id: string }[]}
 */
export function shelfIndexRows(files = []) {
  return files.map(file => ({
    document_id: file.id,
    fields: coerceRecordFields('document_index', {
      name:   fileLabel(file),
      // The upload date is the only date we hold. It is not the date ON the
      // document, and an author correcting it is expected — but a real date
      // beats an empty column, and it is at least true of the file.
      date:   ymd(file.created_at),
      author: '',
      notes:  file.description ?? '',
    }),
  }));
}

/** What the button should say, or '' when there is nothing to add. */
export function describeShelfAddition(pending = []) {
  if (!pending.length) return '';
  return `Add ${pending.length} file${pending.length === 1 ? '' : 's'} from the shelf`;
}
