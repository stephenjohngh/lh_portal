// src/lib/utils/editorSearch.js
// Finding text inside an editor — the pure half, no DOM and no ProseMirror.
//
// Why this exists rather than the browser's own find:
//
//   * Ctrl+F searches the whole PAGE. With the editor in a dialog it happily
//     matches the list behind it, scrolls that instead, and highlights text the
//     reader cannot even see.
//   * It cannot say "3 of 12" in a way anything else can use, and it cannot be
//     driven from a button.
//   * It knows nothing about the document model, so there is nowhere to go from
//     a hit — no way to replace, and no way to keep the match when the editor
//     re-renders.
//
// Tiptap has no official search extension for v3 (checked against the registry:
// the only community one targets v2 and was last published in 2024), so the
// matching lives here and the ProseMirror plumbing lives next door in
// editorSearchExtension.js. The split is the same one markdownPaste uses, and
// for the same reason: this half is testable without a browser.

/**
 * Every occurrence of `needle` in `haystack`, as [from, to) offsets.
 *
 * Case-insensitive, because nobody typing into a find box means otherwise.
 *
 * Overlapping matches are not returned — the search advances past each hit, so
 * "aa" in "aaa" is one match, not two. That is what a person counting
 * occurrences means, and it is what every find bar does.
 *
 * @param {string} haystack
 * @param {string} needle
 * @returns {{ from: number, to: number }[]}
 */
export function findRanges(haystack, needle) {
  const text = String(haystack ?? '');
  const query = String(needle ?? '');
  if (!query) return [];

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const out = [];
  let at = lowerText.indexOf(lowerQuery);
  while (at !== -1) {
    out.push({ from: at, to: at + query.length });
    at = lowerText.indexOf(lowerQuery, at + query.length);
  }
  return out;
}

/**
 * Which match is "current", given a starting point and a direction.
 *
 * Wraps at both ends, because a find bar that stops at the last match makes the
 * reader work out where they are; wrapping means Enter always does something.
 *
 * @param {number} count  how many matches there are
 * @param {number} index  the current one, or -1 for none yet
 * @param {1|-1} step
 * @returns {number} the new index, or -1 when there is nothing to go to
 */
export function stepIndex(count, index, step) {
  if (count <= 0) return -1;
  if (index < 0) return step > 0 ? 0 : count - 1;
  return (index + step + count) % count;
}

/**
 * "3 of 12", or what to say when that would be a lie.
 *
 * A find bar that shows nothing when a query matches nothing is the single
 * most annoying kind: the reader cannot tell a search that found nothing from
 * one that has not run.
 *
 * @param {number} count
 * @param {number} index
 * @param {string} query
 */
export function describeMatches(count, index, query) {
  if (!String(query ?? '').trim()) return '';
  if (count === 0) return 'No matches';
  return `${index + 1} of ${count}`;
}
