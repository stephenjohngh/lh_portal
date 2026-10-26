// A row stamped `created_by` / `updated_by` must be written to a table that HAS
// that column. columnCheck.test.js reads selects, filters and orders; it cannot
// see a write payload, and a stamp the table lacks fails only when somebody
// presses Save — `gt_persons` had no `updated_by`, so every competence edit
// failed from the day the panel was built (2026-10-26).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const types = readFileSync('src/lib/database.types.ts', 'utf8');
const columns = {};
for (const m of types.matchAll(/^ {6}(\w+): \{\s*\n\s+Row: \{([\s\S]*?)\n {8}\}/gm)) {
  columns[m[1]] = new Set([...m[2].matchAll(/^\s+(\w+)\??:/gm)].map((c) => c[1]));
}

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(js|svelte)$/.test(name) && !/\.test\.js$/.test(name)) out.push(p);
  }
  return out;
}

describe('write stamps name columns the table has', () => {
  it('knows the tables it is checking', () => {
    expect(Object.keys(columns).length).toBeGreaterThan(50);
    expect(columns.gt_persons.has('created_by')).toBe(true);
  });

  it('api.create / update / upsert on a literal table never stamps a column it lacks', () => {
    const bad = [];
    for (const path of sources('src')) {
      const text = readFileSync(path, 'utf8');
      for (const m of text.matchAll(/api\.(?:create|update|updateMany|upsert)\(\s*'(\w+)'([\s\S]{0,400}?)\)\s*;?\s*(?:\r?\n|$)/g)) {
        const table = m[1];
        if (!columns[table]) continue;
        for (const stamp of ['updated_by', 'created_by']) {
          if (new RegExp(`\\b${stamp}\\b`).test(m[2]) && !columns[table].has(stamp)) {
            bad.push(`${path.split('\\').join('/')}: ${table}.${stamp}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
