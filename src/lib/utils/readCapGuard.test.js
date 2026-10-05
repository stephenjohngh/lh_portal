// src/lib/utils/readCapGuard.test.js
//
// ⛔ ONE READ STOPS AT 1,000 ROWS, AND SAYS NOTHING. PostgREST caps a response
// at its max-rows setting, so a list read of a table that grows with use looks
// complete until the day it is not — and then the rows that fall off are the
// ones the read happened to sort last. Review §6ccc item 3 (2026-10-03) found:
// the audit-log CSV export returning 1,000 of 2,547 rows · Maintenance reading
// its jobs oldest first, so past 1,000 the UPCOMING work would vanish · a walk
// summary reading one building walk's 1,092 inspections in one go · the photo
// purge listing at most 1,000 photos and then deleting the rows of all of them.
//
// Read every page instead: `api.getAll` / `api.getAllIn` for eq filters,
// `readAllPages` (#lib/utils/readAllPages.js) for anything else. This test
// fails the shapes that brought the faults:
//
//   1. a "list everything" api.get of a growing table — no filter, no limit
//   2. an api.get of one walk's inspections (a building walk passes 1,000)
//   3. a direct supabase list read of a growing table with no filter, no
//      range and no readAllPages
//   4. paging a table that has no `id` column without `tiebreak: false` —
//      getAll breaks ties on `id`, which such a table does not have
//   5. a direct .in() read of a growing table that is not paged
//
// A read with a `limit` is deliberate ("the latest five") and is not flagged.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Small, fixed lists: configuration and reference data, which do not grow
// with use. Every other table is treated as growing.
const REFERENCE = new Set([
  'app_permissions', 'building_systems', 'case_reference_counters', 'component_presets',
  'component_types', 'display_items', 'facilities', 'floors', 'gt_accountable_persons',
  'gt_persons', 'gt_schedule1_categories', 'info_sections', 'maintenance_groups',
  'parking_bays', 'parking_retention_runs', 'parking_tariffs', 'planner_categories',
  'schematics', 'portal_settings', 'profiles', 'space_types', 'type_attribute_options',
  'type_attributes',
]);

// Tables keyed on something other than `id` (their primary key is unique).
const NO_ID = new Set(['statutory_register', 'planner_day_marks', 'gt_audit', 'portal_settings',
  'gt_schedule1_categories', 'case_reference_counters']);

// Direct list reads left unpaged on purpose, each with why.
const ALLOWED_DIRECT = {
  'lib/apps/admin/stores/auditLogsStore.js:audit_logs':
    'fetchLogs pages by offset itself — the .range() is added in a later statement',
  'lib/server/publicationReader.js:document_library':
    "one pack's attached files, filtered to that pack",
};

const ROOT = join(process.cwd(), 'src');
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|svelte)$/.test(name) && !/\.test\.js$/.test(name)) out.push(p);
  }
  return out;
}
const FILES = walk(ROOT)
  .map((p) => ({ rel: relative(ROOT, p).replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }))
  .filter((f) => f.rel !== 'lib/utils/api.js' && f.rel !== 'lib/utils/readAllPages.js');

/** The balanced text of a call starting at `open` (the index of its "("). */
function callText(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

/** Every api.<method>('table', …) call: { rel, line, method, table, text }. */
export function apiCalls(files) {
  const out = [];
  for (const { rel, src } of files) {
    const re = /api\.(get|getAll|getAllIn)\(\s*['"]([a-z_]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
      const text = callText(src, m.index + m[0].indexOf('('));
      out.push({ rel, line: src.slice(0, m.index).split('\n').length, method: m[1], table: m[2], text });
    }
  }
  return out;
}

/** Every direct `.from('table')…select(…)` statement that is a read. */
export function directReads(files) {
  const out = [];
  for (const { rel, src } of files) {
    const re = /\.from\(\s*['"]([a-z_]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      const end  = src.indexOf(';', re.lastIndex);
      const stmt = src.slice(re.lastIndex, end < 0 ? src.length : end);
      if (!/\.select\(/.test(stmt) || /head:\s*true/.test(stmt)) continue;
      const before = src.slice(Math.max(0, m.index - 160), m.index);
      out.push({
        rel, table: m[1], line: src.slice(0, m.index).split('\n').length,
        paged:    /\.(range|limit|single|maybeSingle)\(/.test(stmt) || /readAllPages\(|readAll\(|build\(|readIn\(/.test(before),
        filtered: /\.(eq|in|not|is|gte|lte|gt|lt|ilike|or|contains)\(/.test(stmt),
        byList:   /\.in\(/.test(stmt),
      });
    }
  }
  return out;
}

const growing = (t) => !REFERENCE.has(t);

describe('reads that stop at 1,000 rows', () => {
  const calls = apiCalls(FILES);

  it('finds the reads it exists for (a guard that matches nothing is not a guard)', () => {
    expect(calls.length).toBeGreaterThan(100);
    expect(calls.some((c) => c.method === 'getAll' && c.table === 'maintenance_jobs')).toBe(true);
    expect(directReads(FILES).some((d) => d.table === 'audit_logs')).toBe(true);
  });

  it('1. no "list everything" api.get of a table that grows', () => {
    const bad = calls
      .filter((c) => c.method === 'get' && growing(c.table))
      .filter((c) => !/\b(limit|range)\s*:/.test(c.text) && !/\bfilters\s*:/.test(c.text) && !/,\s*[a-zA-Z_]+\s*\)$/.test(c.text))
      .map((c) => `${c.rel}:${c.line} ${c.table}`);
    expect(bad, 'read every page — api.getAll').toEqual([]);
  });

  it("2. one walk's inspections are read with every page", () => {
    const bad = calls
      .filter((c) => c.method === 'get' && c.table === 'component_inspections'
        && /filters\s*:\s*\{[^}]*walk_session_id/.test(c.text))
      .map((c) => `${c.rel}:${c.line}`);
    expect(bad, 'a building walk records more than 1,000 inspections — api.getAll').toEqual([]);
  });

  it('3. no unpaged, unfiltered direct list read of a table that grows', () => {
    const bad = directReads(FILES)
      .filter((d) => growing(d.table) && !d.paged && !d.filtered)
      .filter((d) => !ALLOWED_DIRECT[`${d.rel}:${d.table}`])
      .map((d) => `${d.rel}:${d.line} ${d.table}`);
    expect(bad, 'read every page — readAllPages').toEqual([]);
  });

  // Found by item 4 (2026-10-03): the Dossier pack reader and archive read a
  // pack's table rows with one .in() — a pack holding more than 1,000 rows
  // showed its outside recipient a table silently cut short.
  it('5. no unpaged .in() read of a table that grows', () => {
    const bad = directReads(FILES)
      .filter((d) => growing(d.table) && d.byList && !d.paged)
      .map((d) => `${d.rel}:${d.line} ${d.table}`);
    expect(bad, 'an id list can match more than 1,000 rows, and a long list overruns the URL — chunks + readAllPages').toEqual([]);
  });

  it('4. a table with no id says its sort column is unique when paged', () => {
    const bad = calls
      .filter((c) => c.method !== 'get' && NO_ID.has(c.table) && !/tiebreak:\s*false/.test(c.text))
      .map((c) => `${c.rel}:${c.line} ${c.table}`);
    expect(bad, "getAll breaks ties on `id`, which this table does not have — pass tiebreak: false").toEqual([]);
  });

  it('no allowance has gone stale', () => {
    const present = new Set(directReads(FILES).map((d) => `${d.rel}:${d.table}`));
    expect(Object.keys(ALLOWED_DIRECT).filter((k) => !present.has(k))).toEqual([]);
  });
});
