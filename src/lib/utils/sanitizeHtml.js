// src/lib/utils/sanitizeHtml.js
//
// HTML sanitiser for any field that will later be rendered with {@html ...}.
// Used for activities.body and info_notes.body — produced by Tiptap in the
// RichTextEditor. Sanitise at the write boundary (issuesStore, infoStore), so
// every read path can render the stored string directly; the views sanitise
// again on display.
//
// ⚠ The allow-list must cover everything the editor's schema can hold
// ($lib/utils/richTextExtensions.js), or it is lost on save with no error.
// If new Tiptap extensions are enabled (e.g. images) extend ALLOWED_TAGS /
// ALLOWED_ATTR here.
//
// Tables (2026-09-28): a pasted markdown table became a real table in the
// editor and would have been flattened to its text here. The table tags carry
// no behaviour; colspan/rowspan are plain numbers. Tiptap's inline `style`
// widths are NOT allowed — style is how arbitrary CSS gets in.

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'ul', 'ol', 'li',
  'code', 'pre',
  'strong', 'em', 's', 'b', 'i', 'u',
  'a', 'span', 'div',
  'table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'colspan', 'rowspan'];

export function sanitizeHtml(html) {
  if (typeof html !== 'string' || html === '') return html;
  // DOMPurify needs `window`. During SSR the input has already been sanitised
  // on write (in the browser), so passing through is safe.
  if (typeof window === 'undefined') return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Force external links to open safely. (Tiptap doesn't always set these.)
    ADD_ATTR: ['target', 'rel'],
  });
}
