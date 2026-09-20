// src/lib/server/markdownDocx.test.js
//
// Inline markdown → docx runs.
//
// ⚠ THIS FILE USED TO BE 440 LINES, most of it about a block-level converter
// that rendered the obligations statement's prose — headings, tables, lists,
// column widths. That prose became rows, the converter went with it, and its
// tests went with that. What remains is what the register's Word output still
// depends on.
//
// ⛔ The emphasis tests are the ones that earned their place. A bold span
// containing an italic one rendered as a stray asterisk with the bold lost, in
// three paragraphs of a document that goes to an external reviewer — and every
// "nothing is dropped" assertion passed the whole time, because every word WAS
// present. Presence is not shape.

import { describe, it, expect } from 'vitest';
import { inlineRuns } from './markdownDocx.js';

/**
 * Every character of text a run would print.
 *
 * ⚠ docx stores a run's text as loose strings under a `w:t` node, not as a
 * `.text` property — an extractor that looks for `.text` finds empty strings
 * everywhere and every content assertion passes vacuously. That cost eleven
 * failing tests on `registerDocx` before it was understood.
 */
function textOf(node) {
  if (node == null || typeof node !== 'object') return '';
  let out = '';
  if (node.rootKey === 'w:t' && Array.isArray(node.root)) {
    for (const r of node.root) if (typeof r === 'string') out += r;
  }
  for (const child of Array.isArray(node.root) ? node.root : []) out += textOf(child);
  return out;
}

const text = rs => rs.map(r => textOf(r)).join('');

/**
 * Whether a run carries a mark, read off its `w:rPr`.
 *
 * ⚠ docx writes the element BARE when the mark is on (`<w:b/>`) and with an
 * explicit `val: false` when it is off — so "on" is the absence of that
 * attribute, not `val === true`. Testing for `true` finds nothing and every
 * assertion here passes or fails for the wrong reason.
 */
function mark(runNode, key) {
  const rPr = (runNode.root ?? []).find(c => c?.rootKey === 'w:rPr');
  const node = (rPr?.root ?? []).find(c => c?.rootKey === key);
  if (!node) return false;
  const attr = (node.root ?? []).find(c => c?.rootKey === '_attr');
  return attr?.root?.val !== false;
}
const boldOf = r => mark(r, 'w:b');
const italicOf = r => mark(r, 'w:i');

describe('inline', () => {
  it('reads bold, italic and code without leaving the syntax behind', () => {
    for (const src of ['**bold**', '*italic*', '`code`']) {
      expect(text(inlineRuns(src))).toBe(src.replace(/[*`]/g, ''));
    }
  });

  // ⚠ The alternation order is load-bearing: try italic first and it matches
  // the opening two asterisks of a bold span, filling the page with strays.
  it('does not mistake the start of a bold span for an italic one', () => {
    const out = text(inlineRuns('a **bold** b'));
    expect(out).toBe('a bold b');
    expect(out).not.toContain('*');
  });

  it('keeps the text around the marked-up part', () => {
    expect(text(inlineRuns('before **middle** after'))).toBe('before middle after');
  });

  it('leaves a lone asterisk alone', () => {
    expect(text(inlineRuns('2 * 3 = 6'))).toBe('2 * 3 = 6');
  });

  it('survives an empty string', () => {
    expect(text(inlineRuns(''))).toBe('');
    expect(text(inlineRuns(undefined))).toBe('');
  });

  // ⚠ The markers are what a reader scans for. Word substitutes a symbol font
  // for glyphs Arial lacks, so they survive untouched.
  it('passes the marker symbols through unchanged', () => {
    expect(text(inlineRuns('⛔ **Blocked** ⚠ ⭐'))).toBe('⛔ Blocked ⚠ ⭐');
  });
});

describe('emphasis inside emphasis', () => {
  // ⛔ THE FAULT: the bold alternative matched only content with NO asterisk in
  // it, so a bold span wrapping an italic one did not match bold at all. It
  // fell through to the italic branch, which started from the SECOND asterisk.
  // The reader got a stray `*`, the bold gone, and emphasis on the wrong words.
  it('renders a bold span that contains an italic one, with no stray markers', () => {
    const out = text(inlineRuns('**Five rows are marked *assurance control only*, and it matters.**'));
    expect(out).toBe('Five rows are marked assurance control only, and it matters.');
    // ⚠ The assertion the old code would fail on. Presence was never the issue.
    expect(out).not.toContain('*');
  });

  it('makes the inner span bold AND italic, not one or the other', () => {
    const runs = inlineRuns('**outer *inner* outer**');
    expect(text(runs)).toBe('outer inner outer');
    expect(runs.every(boldOf)).toBe(true);
    // ⭐ And exactly the inner words are also italic. Before the fix the bold
    // was lost and the italic landed on "outer " instead.
    expect(runs.filter(italicOf).map(r => textOf(r)).join('')).toBe('inner');
  });

  it('does not let one bold span run on into the next', () => {
    const runs = inlineRuns('**a** and **b**');
    expect(text(runs)).toBe('a and b');
    expect(runs.filter(boldOf).map(r => textOf(r)).join('|')).toBe('a|b');
  });
});
