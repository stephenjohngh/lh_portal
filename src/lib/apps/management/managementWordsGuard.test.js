// The Management screens say a thing one way (2026-10-27). A walk through the
// whole app found an action's status printed from its stored value
// ("In-Progress", from CSS capitalising "in-progress") in seven places while the
// forms said "In Progress", and the issue report printing a priority as "3".
// The words are written once in #lib/utils/constants.js; a screen reads them.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(svelte|js)$/.test(p) && !/\.test\.js$/.test(p)) out.push(p);
  }
  return out;
}

describe('Management prints stored values as their words', () => {
  const all = files('src/lib/apps/management');
  it('scans the app', () => expect(all.length).toBeGreaterThan(20));

  it('never prints an action status or a priority raw', () => {
    const bad = [];
    for (const p of all) {
      const s = readFileSync(p, 'utf8');
      if (/\{\s*(action|a|linkedAction)\.status\s*\}/.test(s)) bad.push(`${p}: action status`);
      if (/Priority:\s*\{issue\.priority\}/.test(s)) bad.push(`${p}: priority`);
    }
    expect(bad).toEqual([]);
  });
});
