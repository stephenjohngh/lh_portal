// A floating panel (menu, popover) must have an OPAQUE background.
// 2026-10-30: the Schematic Admin menu used `.admin-only`, whose background is 25% brown,
// so the page behind showed through and the menu could not be read. A floating admin
// panel uses `.admin-only-solid`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (p.endsWith('.svelte')) out.push(p);
  }
  return out;
}

describe('floating panels are opaque', () => {
  it('no absolutely positioned, z-indexed element uses the translucent .admin-only', () => {
    const bad = [];
    for (const p of walk('src')) {
      const s = fs.readFileSync(p, 'utf8');
      for (const m of s.matchAll(/class="([^"]*)"/g)) {
        const c = m[1];
        if (/\babsolute\b/.test(c) && /\bz-\d+/.test(c) && /\badmin-only(?!-)/.test(c)) bad.push(p.replace(/\\/g, '/'));
      }
    }
    expect(bad, 'use admin-only-solid for a floating panel').toEqual([]);
  });

  it('the solid class is defined, opaque', () => {
    const css = fs.readFileSync('src/app.css', 'utf8');
    const rule = css.match(/\.admin-only-solid\s*\{([^}]*)\}/);
    expect(rule).toBeTruthy();
    expect(rule[1]).toMatch(/background-color:\s*rgb\(\s*\d+\s+\d+\s+\d+\s*\)/);   // no alpha
  });
});
