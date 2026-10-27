// An action that exists only while the pointer is over its row cannot be found by
// reading the screen, and cannot be reached at all on a touch screen. Section
// delete in Info, page reordering in Dossier and document delete everywhere were
// all like that (found running the Info tutorial, 2026-10-27). Controls are shown.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.svelte')) out.push(p);
  }
  return out;
}

describe('hover-only controls', () => {
  const all = files('src');
  it('scans the components', () => expect(all.length).toBeGreaterThan(100));
  it('hides no control until the pointer is over it', () => {
    const bad = [];
    for (const p of all) {
      const s = readFileSync(p, 'utf8');
      if (/opacity-0[\s\S]{0,120}group-hover:opacity-100/.test(s) || /hidden group-hover:(flex|block|inline)/.test(s)
        || /pointer-events-none[\s\S]{0,120}group-hover:pointer-events-auto/.test(s)) bad.push(p);
    }
    expect(bad).toEqual([]);
  });
});
