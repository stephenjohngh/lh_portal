// src/lib/utils/sanitizeHtml.js
//
// HTML sanitiser for any field that will later be rendered with {@html ...}.
// Currently used for activities.body — produced by Tiptap in the RichTextEditor.
// Sanitise at the write boundary (issuesStore.addActivity / updateActivity), so
// every read path can render the stored string directly without further checks.
//
// Allow-list matches Tiptap StarterKit output. If new Tiptap extensions are
// enabled (e.g. images, tables) extend ALLOWED_TAGS / ALLOWED_ATTR here.

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'ul', 'ol', 'li',
  'code', 'pre',
  'strong', 'em', 's', 'b', 'i', 'u',
  'a', 'span', 'div',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

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
