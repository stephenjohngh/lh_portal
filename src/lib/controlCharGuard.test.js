// src/lib/controlCharGuard.test.js
//
// ⛔ No control character in source (2026-10-04, PROJECT_STATUS §6ccc item 6).
//
// A scripted edit once wrote `\b` into a regex as a literal BACKSPACE, so
// maintenanceStore.test.js's guard against the non-existent `components.name`
// column looked for "name" wrapped in backspaces and could never fail. Nothing
// shows it: an editor draws nothing, the test passes, and the guard is dead.
// Tab, newline and carriage return are the only ones source may hold.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');

/** @param {string} dir @param {string[]} [out] */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|ts|svelte|json|md|sql|css|html)$/.test(name)) out.push(p);
  }
  return out;
}

// Every C0 control character except tab, newline and carriage return, and DEL.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

describe('source files', () => {
  const files = walk(ROOT);

  it('finds the files it exists for', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('hold no control character but tab, newline and carriage return', () => {
    const bad = files.filter((f) => CONTROL.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));
    expect(bad).toEqual([]);
  });
});
