// src/lib/utils/textSearch.js
// The two things every in-app text search needs — pure, no DOM, no DB.
//
// Extracted from Dossier's packSearch.js when the Management app needed the
// same behaviour. Kept deliberately small: what varies between searches is
// WHERE the text comes from and what a result means, and that belongs with the
// app that owns the data. What does not vary is how a hit is shown to somebody.

/** Characters either side of a hit in a snippet. */
export const SNIPPET_PAD = 60;

/**
 * The text around the first occurrence of `query`, with the hit's offsets.
 *
 * Offsets rather than markup, so author text is never interpolated into HTML —
 * the caller slices the string and wraps the middle in a `<mark>`. A search
 * result is a place where hostile text is most likely to arrive, and it is the
 * one place a reader is guaranteed to look.
 *
 * @param {string} text
 * @param {string} query
 * @returns {{ text: string, from: number, to: number } | null}
 */
export function snippetAround(text, query) {
  const at = String(text ?? '').toLowerCase().indexOf(String(query ?? '').toLowerCase());
  if (at === -1) return null;

  const start = Math.max(0, at - SNIPPET_PAD);
  const end   = Math.min(text.length, at + query.length + SNIPPET_PAD);
  const lead  = start > 0 ? '…' : '';
  const tail  = end < text.length ? '…' : '';

  return {
    text: `${lead}${text.slice(start, end)}${tail}`,
    from: lead.length + (at - start),
    to:   lead.length + (at - start) + query.length,
  };
}

/**
 * Readable text from stored rich text.
 *
 * Rich-text bodies are stored as HTML, so searching them raw is wrong twice
 * over: `strong` and `href` match as if they were words the author wrote, and a
 * phrase broken by any formatting — "the **fire** door" — cannot be found at
 * all, because the tag sits in the middle of it.
 *
 * Block-level tags become a space so words either side of a paragraph break do
 * not fuse into one; entities are decoded, since `&amp;` is an ampersand to
 * anybody typing a query.
 *
 * Regex rather than DOMParser because this runs in tests and on the server as
 * well as in a browser, and because the input is our own sanitised HTML rather
 * than something arbitrary being trusted.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  return String(html ?? '')
    // A tag boundary is a word boundary. Without this, "</p><p>" joins the last
    // word of one paragraph to the first of the next.
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi,  '&')
    .replace(/&lt;/gi,   '<')
    .replace(/&gt;/gi,   '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g,   "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does this text contain the query, case-insensitively?
 *
 * @param {string} text
 * @param {string} query
 */
export function contains(text, query) {
  if (!query) return false;
  return String(text ?? '').toLowerCase().includes(String(query).toLowerCase());
}
