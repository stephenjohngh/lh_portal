// src/lib/server/markdownDocx.js
//
// Inline markdown → docx runs. Bold, italic and code, nothing else.
//
// ⚠ THIS FILE USED TO BE FOUR TIMES THIS SIZE. It carried a whole block-level
// markdown converter — headings, tables with computed column widths,
// blockquotes, bullet and numbered lists, horizontal rules — built to render the
// obligations statement's 550 lines of prose into Word.
//
// ⛔ That prose no longer exists. It was three LISTS written as paragraphs, and
// they are rows now — caveats, reasoned absences and outstanding actions, in the
// register itself. A converter with no document left to convert is weight: 200
// lines of logic and 350 of tests that nothing calls, quietly rotting until
// somebody trusts it.
//
// What survives is the part the REGISTER's Word output still needs. An item's
// name, description and consequence carry inline emphasis and the ⛔ ⚠ ⭐
// markers, and nothing else — no tables, no lists, no headings — so inline runs
// are the whole requirement.
//
// ⚠ The marker symbols pass through unchanged. Word substitutes a symbol font
// for glyphs Arial lacks, which is why they survive; stripping them to keep one
// font would remove the thing a reader scans for.

import { run } from './docxHelpers.js';

/**
 * Inline markdown → docx runs.
 *
 * ⚠ The order in the alternation matters: `**bold**` must be tried before
 * `*italic*`, or the italic branch matches the first two asterisks of a bold
 * span and the document fills with stray asterisks.
 *
 * ⛔ AND A BOLD SPAN MUST BE ALLOWED TO CONTAIN AN ITALIC ONE. The bold branch
 * was written to match content with NO asterisk in it, so a nested
 * `**bold with *italic* inside**` did not match it at all. It fell through to
 * the italic branch, which matched from the SECOND asterisk — so the reader got
 * a stray `*`, the bold lost entirely, and emphasis on the wrong words.
 * **THREE PARAGRAPHS OF THE OBLIGATIONS STATEMENT RENDERED THAT WAY**, one of
 * them an ⛔-marked warning about the assurance rows.
 *
 * ⚠ Every word was present, which is why the "nothing is dropped" test passed
 * on all three: that test asserts PRESENCE, and this is about SHAPE. Only
 * reading the generated document showed it — the same lesson as the column
 * widths, one layer up.
 *
 * The bold alternative cannot cross a `**`, so a span still ends at its own
 * closing marker rather than running on to the next one's.
 *
 * @param {string} text
 * @param {{size?: number, bold?: boolean, italics?: boolean, color?: string}} [base]
 * @returns {import('docx').TextRun[]}
 */
export function inlineRuns(text, base = {}) {
  const src = String(text ?? '');
  if (!src) return [run('', base)];

  const parts = src.split(/(\*\*(?:[^*]|\*(?!\*))+\*\*|`[^`]+`|\*[^*\n]+\*)/g).filter(p => p !== '');
  return parts.flatMap((p) => {
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
      // ⭐ Recursive, so an inner `*italic*` comes out bold AND italic rather
      // than as literal asterisks inside a bold run. It terminates: the pattern
      // above cannot capture a `**`, so the inner text never holds one.
      return inlineRuns(p.slice(2, -2), { ...base, bold: true });
    }
    if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) {
      // ⚠ Rendered as italic rather than in a monospace font.
      return [run(p.slice(1, -1), { ...base, italics: true })];
    }
    if (p.length > 2 && p.startsWith('*') && p.endsWith('*')) {
      return [run(p.slice(1, -1), { ...base, italics: true })];
    }
    return [run(p, base)];
  });
}
