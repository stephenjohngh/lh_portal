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

// ── Filtering a list by a search box ─────────────────────────────────────────
//
// ONE rule for every search box that narrows a list (2026-10-02, PROJECT_STATUS
// §6aaa item 5). Twenty-odd lists wrote their own, and they disagreed:
//   · some trimmed the query and some did not — "lift " found nothing;
//   · some read a field that can be empty without a guard — MOR's case list
//     would throw on a case with no description;
//   · the phone's issue list searched stored HTML, so "strong" found every
//     comment with bold text in it;
//   · "fire door" found "Fire door" and not "Door, fire" — the words had to be
//     next to each other, in that order, in one field.
//
// The rule: the query is split into words, and a row matches when EVERY word
// appears in at least one of its fields — case and accents ignored, empty
// fields skipped, numbers read as text. An empty query matches everything.
// ⚠ Searches that SHOW where they hit (Dossier's pack search, Management's
// issue search) keep phrase matching: they highlight the phrase.

/** Lower case, accents folded: "Café" and "cafe" are the same word to a reader. */
function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * The words of a query: trimmed, lower-cased, accents folded.
 * @param {unknown} query
 * @returns {string[]}
 */
export function searchWords(query) {
  return fold(query).split(/\s+/).filter(Boolean);
}

/**
 * Does a row match a search box? Every word of the query must appear in at
 * least one of the values; arrays are searched item by item; null, undefined
 * and empty values are skipped.
 *
 * Pass rich-text fields through `stripHtml` first, or tag names will match.
 *
 * @param {unknown[]} values  the fields a person can see for this row
 * @param {unknown} query     what was typed
 * @returns {boolean}
 */
export function matchesSearch(values, query) {
  const words = searchWords(query);
  if (!words.length) return true;
  const hay = (values ?? []).flat(Infinity)
    .filter((v) => v != null && v !== '')
    .map(fold);
  return words.every((w) => hay.some((h) => h.includes(w)));
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
