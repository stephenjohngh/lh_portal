// src/lib/utils/storeLoadGuard.test.js
//
// A store's load goes through storeLoader (storeLoad.js). The hand-written
// `update(s => ({ ...s, loading: true … }))` block is what it replaced, and
// every copy could set `error` to undefined, fetch twice, and let a stale
// response win. A store that genuinely needs its own load is named here with
// the reason, and the reason is checked so it cannot outlive the code.

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
const HAND_WRITTEN = new RegExp('(update|set)\\(.*loading: true');

/** file → why it keeps its own load. */
const OWN_LOAD = {
  'src/lib/apps/inspection/stores/inspectionStore.js':
    'falls back to the offline cache when the network fails, so a walk can start with no signal',
  'src/lib/apps/mobileplan/stores/mobileplanStore.js':
    'falls back to the offline cache, and restores the saved filter before reading',
  'src/lib/apps/parkingmobile/stores/parkingMobileStore.js':
    'shows the phone copy first and refreshes it when there is a signal, so the lookup works in the basement without one',
  'src/lib/stores/statutoryRegister.js':
    'levels the table with the shipped seed and falls back to the seed — never an empty register',
  'src/lib/apps/admin/stores/auditLogsStore.js':
    'records the filters being applied as the read starts, for the screen to show',
  'src/lib/apps/mor/stores/morStore.js':
    'fetchCase is written by refreshCase, which other actions share; the case list uses storeLoader',
};

const OWNER = 'src/lib/utils/storeLoad.js';
const code = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('stores load through storeLoader', () => {
  const files = sources('src/lib');

  it('finds the stores it exists for', () => {
    expect(files).toContain(OWNER);
    expect(files).toContain('src/lib/apps/parking/stores/parkingStore.js');
  });

  it('no store hand-writes a load, unless it says why', () => {
    const offenders = files
      .filter((f) => f !== OWNER && !OWN_LOAD[f])
      .filter((f) => HAND_WRITTEN.test(code(readFileSync(f, 'utf8'))));
    expect(offenders, 'use storeLoader from #lib/utils/storeLoad.js, or add the file to OWN_LOAD with the reason').toEqual([]);
  });

  it('every exception still has a hand-written load to excuse', () => {
    for (const f of Object.keys(OWN_LOAD)) {
      expect(HAND_WRITTEN.test(code(readFileSync(f, 'utf8'))), `${f} no longer needs its exception`).toBe(true);
    }
  });

  it('recognises the old habit', () => {
    expect(HAND_WRITTEN.test('update(s => ({ ...s, loading: true, error: null }));')).toBe(true);
    expect(HAND_WRITTEN.test("const load = storeLoader(update, fetch, apply);")).toBe(false);
  });
});
