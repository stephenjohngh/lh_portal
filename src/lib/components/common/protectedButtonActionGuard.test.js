// A <ProtectedButton> with neither `action` nor `requireAdmin` is shown to
// EVERYONE — its default is action="view" — so it protects nothing. On
// 2026-10-25 a read-only account was offered "+ Log a complaint" and the
// Planner's "+ New event" for that reason. A button that creates or changes
// something says action="modify" (or requireAdmin); one that only shows says
// action="view" outright, so the choice is visible.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function svelteFiles(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...svelteFiles(p));
    else if (p.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** The opening tags of every ProtectedButton in a file, braces kept whole. */
function tags(src) {
  const found = [];
  for (const m of src.matchAll(/<ProtectedButton\b/g)) {
    let i = m.index + m[0].length, depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    found.push({ tag: src.slice(m.index, i), line: src.slice(0, m.index).split('\n').length });
  }
  return found;
}

describe('ProtectedButton always says what it protects', () => {
  it('every one has action= or requireAdmin', () => {
    const bad = [];
    for (const file of svelteFiles('src')) {
      for (const t of tags(fs.readFileSync(file, 'utf8'))) {
        if (!/\baction=|\brequireAdmin/.test(t.tag)) bad.push(`${file}:${t.line}`);
      }
    }
    expect(bad, 'add action="modify" (writes) or action="view" (shows only)').toEqual([]);
  });

  it('the scan still finds the buttons it exists for', () => {
    const n = svelteFiles('src').reduce((k, f) => k + tags(fs.readFileSync(f, 'utf8')).length, 0);
    expect(n).toBeGreaterThan(20);
  });
});
