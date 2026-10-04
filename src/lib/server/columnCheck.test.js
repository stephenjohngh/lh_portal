// src/lib/server/columnCheck.test.js
//
// ⛔ Every column a query names exists (2026-10-04, PROJECT_STATUS §6ccc item 6).
//
// A test built on a hand-made fixture never runs the real query, so a column
// that does not exist passes every test and fails the first time a person
// uses the screen. This read found two live ones: Maintenance ordered a job's
// component results by a created_at the table does not have, and MOR read and
// wrote a contact_kind that migration 139 — never applied — was to add.
//
// It checks against src/lib/database.types.ts, generated from prod's schema.
// ⚠ After a migration adds or drops a column, regenerate those types (the
// command is in CLAUDE.md § Database types) or this test is checking an old
// schema.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ── The reader ───────────────────────────────────────────────────────────────
// Deliberately narrow: it reads only what is written as a plain literal —
// .from(…) chains with .select / .eq … .order, and api.get / getAll / count /
// getAllIn with select, orderBy and filters — and inside a select the embedded
// tables `rel(cols)`, `alias:rel(cols)`, `rel!fk(cols)`. Anything built at run
// time is not read. It lives here, with the only thing that uses it.

/**
 * table → Set of column names, from the generated types.
 * @param {string} typesSource  database.types.ts
 */
function schemaColumns(typesSource) {
  /** @type {Map<string, Set<string>>} */
  const out = new Map();
  const start = typesSource.indexOf('Tables: {');
  const end = typesSource.indexOf('Views: {', start);
  const block = typesSource.slice(start, end > 0 ? end : undefined).replace(/\r\n/g, '\n');
  for (const m of block.matchAll(/^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm)) {
    out.set(m[1], new Set([...m[2].matchAll(/^ {10}(\w+)\??:/gm)].map((c) => c[1])));
  }
  return out;
}

/** Split on commas at the top level of parentheses. @param {string} s */
function topLevel(s) {
  const parts = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * The column references in a select string, as [table, column] pairs.
 * @param {string} table
 * @param {string} select
 * @returns {[string, string][]}
 */
function selectColumns(table, select) {
  /** @type {[string, string][]} */
  const out = [];
  for (const item of topLevel(select.replace(/\s+/g, ' '))) {
    if (item === '*' || /\bcount\b/.test(item)) continue;
    const embed = /^(?:\w+:)?(\w+)(?:!\w+)*\s*\(([\s\S]*)\)$/.exec(item);
    if (embed) { out.push(...selectColumns(embed[1], embed[2])); continue; }
    const col = /^(?:\w+:)?(\w+)(?:::\w+)?$/.exec(item);
    if (col) out.push([table, col[1]]);
  }
  return out;
}

/** The text of a call from its opening bracket to the matching close. @param {string} src @param {number} open */
function callText(src, open) {
  let depth = 0;
  for (let i = open; i < src.length && i < open + 4000; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open, open + 1200);
}

const FILTER = /\.(eq|neq|gt|gte|lt|lte|in|is|like|ilike|not|order|contains)\(\s*'(\w+)'/g;

/**
 * Every column a source file names in a query, as { table, column, at } —
 * `at` a short excerpt for the failure message.
 * @param {string} src
 */
function queryColumns(src) {
  /** @type {{ table: string, column: string, at: string }[]} */
  const out = [];
  const add = (/** @type {string} */ table, /** @type {string} */ column, /** @type {string} */ at) =>
    out.push({ table, column, at: at.replace(/\s+/g, ' ').slice(0, 90) });

  // .from('t') chains — up to the end of the statement or the next .from(
  for (const m of src.matchAll(/\.from\(\s*'(\w+)'\s*\)/g)) {
    let chain = src.slice(m.index, m.index + 1500);
    const stop = chain.slice(1).search(/;|\.from\(|\n\s*\n/);
    if (stop > 0) chain = chain.slice(0, stop + 1);
    const sel = /\.select\(\s*(['`])([^'`$]*)\1/.exec(chain);
    if (sel) for (const [t, c] of selectColumns(m[1], sel[2])) add(t, c, chain);
    for (const f of chain.matchAll(FILTER)) add(m[1], f[2], chain);
  }

  // api.get / getAll / count / getAllIn ('t', …) — inside the call's own brackets
  for (const m of src.matchAll(/\bapi\.(get|getAll|count|getAllIn)\(\s*'(\w+)'/g)) {
    const table = m[2];
    const call = callText(src, m.index + m[0].indexOf('('));
    if (m[1] === 'getAllIn') {
      const col = /^\(\s*'\w+'\s*,\s*'(\w+)'/.exec(call);
      if (col) add(table, col[1], call);
    }
    const sel = /\bselect:\s*(['`])([^'`$]*)\1/.exec(call);
    if (sel) for (const [t, c] of selectColumns(table, sel[2])) add(t, c, call);
    const ord = /\borderBy:\s*'(\w+)'/.exec(call);
    if (ord) add(table, ord[1], call);
    const filt = /\bfilters:\s*\{([^{}]*)\}/.exec(call);
    if (filt) for (const k of filt[1].matchAll(/(?:^|,)\s*(\w+)\s*:/g)) add(table, k[1], call);
  }
  return out;
}

const ROOT = join(process.cwd(), 'src');
const SCHEMA = schemaColumns(readFileSync(join(ROOT, 'lib/database.types.ts'), 'utf8'));

/** @param {string} dir @param {string[]} [out] */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|svelte)$/.test(name) && !/\.test\.js$/.test(name) && !p.endsWith('columnCheck.test.js')) out.push(p);
  }
  return out;
}

// A column the code may name before the migration that adds it is applied:
// named, with the reason, and the last test fails once it exists. Empty since
// migration 234 brought mor_timeline_entries.contact_kind (2026-10-04).
const AWAITING = new Set(/** @type {string[]} */ ([]));

describe('reading a select', () => {
  it('reads plain columns, aliases and casts', () => {
    expect(selectColumns('t', 'id, name, label:title, at::date')).toEqual([['t', 'id'], ['t', 'name'], ['t', 'title'], ['t', 'at']]);
  });
  it('reads an embedded table, aliased or by foreign key', () => {
    expect(selectColumns('jobs', '*, component:components(id, label), owner:profiles!jobs_owner_fkey(full_name)'))
      .toEqual([['components', 'id'], ['components', 'label'], ['profiles', 'full_name']]);
  });
  it('reads a filter and an order on a .from() chain, and an api.get call', () => {
    const cols = queryColumns(`db.from('a').select('x').eq('y', 1).order('z'); api.get('b', { orderBy: 'p', filters: { q: 1 } })`)
      .map((c) => `${c.table}.${c.column}`);
    expect(cols).toEqual(['a.x', 'a.y', 'a.z', 'b.p', 'b.q']);
  });
});

describe('the code', () => {
  const refs = walk(ROOT).flatMap((f) =>
    queryColumns(readFileSync(f, 'utf8')).map((q) => ({ ...q, file: relative(ROOT, f).replace(/\\/g, '/') })));

  it('names enough columns that this is still a check', () => {
    expect(SCHEMA.size).toBeGreaterThan(60);
    expect(refs.length).toBeGreaterThan(800);
  });

  it('queries only tables the schema has', () => {
    expect([...new Set(refs.filter((r) => !SCHEMA.has(r.table)).map((r) => `${r.file}: ${r.table}`))]).toEqual([]);
  });

  it('names only columns the table has', () => {
    const bad = refs
      .filter((r) => SCHEMA.has(r.table) && !SCHEMA.get(r.table)?.has(r.column))
      .filter((r) => !AWAITING.has(`${r.table}.${r.column}`))
      .map((r) => `${r.file}: ${r.table}.${r.column}  [${r.at}]`);
    expect(bad).toEqual([]);
  });

  it('every awaited column is still missing — once it exists, remove it from AWAITING', () => {
    const present = [...AWAITING].filter((tc) => { const [t, c] = tc.split('.'); return SCHEMA.get(t)?.has(c); });
    expect(present).toEqual([]);
  });
});
