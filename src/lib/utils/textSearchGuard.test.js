// src/lib/utils/textSearchGuard.test.js
//
// A search box that narrows a list uses matchesSearch (textSearch.js). Twenty
// lists wrote their own and disagreed: some did not trim, one threw on an empty
// field, one searched stored HTML, and none found two words apart. A place
// that genuinely needs its own matching is named here with the reason, and the
// reason is checked so it cannot outlive the code.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { sources(path, out); continue; }
    if (/\.test\.js$/.test(name)) continue;
    if (/\.(js|svelte)$/.test(name)) out.push(path.replace(/\\/g, '/'));
  }
  return out;
}

// Built from a string: Vite's import scanner misreads some regex literals.
const HAND_WRITTEN = new RegExp('toLowerCase\\(\\)\\.(includes|indexOf)\\(');

const OWN_MATCHING = {
  'src/lib/utils/textSearch.js': 'the owner',
  'src/lib/apps/dossier/utils/packSearch.js':
    'shows where it hit and highlights the phrase, so it matches the phrase, not words',
  'src/lib/apps/building_assets/utils/attrFilters.js':
    'the "contains" operator of an attribute filter: the value a person typed, as one phrase',
  'src/routes/api/media/file/fakeDb.js':
    'a test double imitating PostgREST ilike, not a search box',
};

const code = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('search boxes use matchesSearch', () => {
  const files = sources('src');

  it('finds the files it exists for', () => {
    expect(files).toContain('src/lib/utils/textSearch.js');
    expect(files).toContain('src/lib/apps/mor/components/CaseList.svelte');
  });

  it('no file matches text by hand, unless it says why', () => {
    const offenders = files
      .filter((f) => !OWN_MATCHING[f])
      .filter((f) => HAND_WRITTEN.test(code(readFileSync(f, 'utf8'))));
    expect(offenders, 'use matchesSearch from $lib/utils/textSearch.js, or add the file to OWN_MATCHING with the reason').toEqual([]);
  });

  it('every exception still has something to excuse', () => {
    for (const f of Object.keys(OWN_MATCHING)) {
      expect(HAND_WRITTEN.test(code(readFileSync(f, 'utf8'))), `${f} no longer needs its exception`).toBe(true);
    }
  });

  it('recognises the old habit', () => {
    expect(HAND_WRITTEN.test("(c.label ?? '').toLowerCase().includes(q)")).toBe(true);
    expect(HAND_WRITTEN.test('matchesSearch([c.label], q)')).toBe(false);
  });
});
