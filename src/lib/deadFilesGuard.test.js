// src/lib/deadFilesGuard.test.js
//
// Every file under src/lib is imported by something (2026-10-02,
// PROJECT_STATUS §6bbb item 2). Seven had stopped being used and stayed —
// a retired Dossier view, a card nothing rendered, a parser only its own test
// imported — and three comments elsewhere still described them as live, which
// is worse than the files themselves. A file kept on purpose is named here
// with the reason, and the reason is checked so it cannot outlive the file.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve('src');
const rel = (p) => relative(resolve('.'), p).replace(/\\/g, '/');

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(js|ts|svelte|css|md)$/.test(name)) out.push(p);
  }
  return out;
}

const isTest = (p) => /\.test\.js$|\.harness\.svelte$/.test(p);

// Built from a string: Vite's import scanner misreads some regex literals.
const SPEC = new RegExp(
  "(?:from\\s*|import\\s*\\(\\s*|import\\s+|@import\\s+)['\"]([^'\"]+)['\"]", 'g');

function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith('$lib/')) base = join(ROOT, 'lib', spec.slice(5));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  base = base.replace(/\?[a-z]+$/, '');
  for (const c of [base, `${base}.js`, `${base}.ts`, `${base}.svelte`, join(base, 'index.js')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Files under src/lib that nothing outside a test imports. */
function unimported() {
  const all = sources(ROOT);
  const used = new Set();
  for (const f of all) {
    if (isTest(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(SPEC)) {
      const t = resolveSpec(f, m[1]);
      if (t) used.add(t);
    }
  }
  return all
    .filter((f) => rel(f).startsWith('src/lib/') && !isTest(f) && !used.has(f))
    .map(rel);
}

const KEPT = {
  'src/lib/index.js': "SvelteKit's $lib entry stub",
  'src/lib/apps/dossier/public.js':
    "the app's cross-app interface, deliberately empty until another app needs Dossier's data",
};

describe('every file under src/lib is used', () => {
  const orphans = unimported();

  it('nothing is left that nothing imports, unless it says why', () => {
    const unexplained = orphans.filter((f) => !KEPT[f]);
    expect(unexplained, 'delete it (and fix any comment that still describes it), or name it in KEPT with the reason').toEqual([]);
  });

  it('every exception still needs excusing', () => {
    for (const f of Object.keys(KEPT)) expect(orphans, `${f} is imported now — remove it from KEPT`).toContain(f);
  });

  it('follows the imports it exists for', () => {
    // An app shell is loaded by a dynamic import(); a stylesheet by a bare
    // import. If the scan stopped seeing either, every one would be "dead".
    expect(orphans).not.toContain('src/lib/apps/parking/ParkingApp.svelte');
    expect(orphans).not.toContain('src/lib/apps/dossier/dataset-table.css');
    expect(orphans).not.toContain('src/lib/utils/download.js');
  });
});
