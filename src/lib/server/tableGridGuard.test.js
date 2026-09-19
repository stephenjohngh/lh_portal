// src/lib/server/tableGridGuard.test.js
//
// Every Word table must declare its column grid.
//
// ⛔ THE FAULT, AND WHY IT KEEPS COMING BACK. A docx table's column widths are
// honoured only when BOTH of these are set:
//
//   layout:       TableLayoutType.FIXED     → else the renderer autofits to content
//   columnWidths: [...]                     → else the library emits a PLACEHOLDER
//                                             `<w:tblGrid>` of 100 DXA per column
//
// The second is the one that gets forgotten, and it is the one that decides what
// a reader sees: **the renderer sizes columns from the GRID**, not from each
// cell's `w:tcW`. A table can declare 4600/1300/1900/2200/1800/2300/1298 on
// every cell and still print seven equal columns, which is exactly what the
// register extract did from the day it shipped.
//
// ⚠ IT HAS BEEN FIXED BEFORE, PER FILE, AND CAME BACK. Eight builders in this
// codebase pass both options; three did not — `complianceDocx`, `registerDocx`
// and `markdownDocx` — and all three rendered evenly. Fixing the instances
// again would leave the next builder to rediscover it. This is the rule.
//
// ⭐ AND IT SURVIVED THREE ROUNDS OF TESTS THAT PASSED. First the `w:tcW`
// values were asserted — correct all along. Then `w:tblLayout` — added, still
// wrong. Only the grid is what the reader gets. A check compares only what it
// was told to compare, so this one is aimed at the last link in the chain.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every .js file under src/, excluding tests. */
function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { sourceFiles(path, out); continue; }
    if (name.endsWith('.test.js') || name.endsWith('.harness.svelte')) continue;
    if (name.endsWith('.js')) out.push(path);
  }
  return out;
}

/**
 * The text of each `new Table({ … })` call, by brace matching.
 *
 * ⚠ Brace matching rather than a regex: these options objects contain nested
 * objects, arrays and arrow functions, and a non-greedy regex stops at the
 * first `}` — which is usually inside `width: { … }`, three lines in.
 */
function tableCalls(source) {
  const calls = [];
  let at = source.indexOf('new Table({');
  while (at !== -1) {
    let depth = 0, i = at + 'new Table('.length;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    calls.push(source.slice(at, i));
    at = source.indexOf('new Table({', i);
  }
  return calls;
}

const FILES = sourceFiles('src');

describe('every Word table declares its column grid', () => {
  const withTables = FILES
    .map(f => [f, readFileSync(f, 'utf8')])
    .filter(([, s]) => s.includes('new Table({'));

  // ⚠ Round 14's dead claim is why this is here: a scan that matches nothing
  // passes for ever and tells you nothing. If the builders move or are renamed,
  // this fails rather than quietly covering an empty set.
  it('finds the table builders it exists for', () => {
    const names = withTables.map(([f]) => f.replace(/\\/g, '/'));
    expect(names.length).toBeGreaterThanOrEqual(5);
    for (const expected of [
      'src/lib/server/markdownDocx.js',
      'src/lib/server/registerDocx.js',
      'src/lib/server/complianceDocx.js',
    ]) {
      expect(names.some(n => n.endsWith(expected)), expected).toBe(true);
    }
  });

  it('passes columnWidths on every table', () => {
    const offenders = [];
    for (const [file, source] of withTables) {
      tableCalls(source).forEach((call, n) => {
        if (!/\bcolumnWidths\s*:/.test(call)) {
          offenders.push(`${file.replace(/\\/g, '/')} — table ${n + 1}`);
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  // ⚠ EXEMPT: a table of ONE full-width column. Several reports use one as a
  // shaded full-width box, and a single column cannot be mis-split however the
  // renderer autofits — so requiring a fixed layout there would be a rule with
  // no fault behind it, which is how a guard turns into noise. Any table whose
  // column count is not a one-element literal has to fix its layout.
  const singleColumn = call => /columnWidths:\s*\[[^,[\]]*\]/.test(call);

  it('sets a fixed layout on every table of more than one column', () => {
    const offenders = [];
    for (const [file, source] of withTables) {
      tableCalls(source).forEach((call, n) => {
        if (singleColumn(call)) return;
        if (!/TableLayoutType\.FIXED/.test(call)) {
          offenders.push(`${file.replace(/\\/g, '/')} — table ${n + 1}`);
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('recognises a single-column table, and does not exempt a two-column one', () => {
    // The exemption is the only place this guard can go quiet by accident.
    expect(singleColumn('columnWidths: [CONTENT_W],')).toBe(true);
    expect(singleColumn('columnWidths: [10800],')).toBe(true);
    expect(singleColumn('columnWidths: [META_L, META_R],')).toBe(false);
    expect(singleColumn('columnWidths: cols,')).toBe(false);
    expect(singleColumn('columnWidths: widths(),')).toBe(false);
  });

  it('reads a whole options object rather than stopping at the first brace', () => {
    // The brace matcher is the part most likely to be quietly wrong, and a
    // matcher that truncated would report every table as an offender — or, if
    // it truncated the other way, none.
    const sample = 'new Table({\n  width: { size: 1, type: 2 },\n  columnWidths: [1, 2],\n  rows: [],\n});';
    const [call] = tableCalls(sample);
    expect(call).toContain('columnWidths');
    expect(call).toContain('rows: []');
    expect(tableCalls(`${sample}\n${sample}`)).toHaveLength(2);
  });
});
