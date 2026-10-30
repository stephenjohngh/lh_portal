// The Guides app is a hub other apps READ through guides/public.js (build plan §0).
//   · nothing outside guides/ imports a file inside it except public.js;
//   · nothing outside guides/ names a guide table (no reading or writing around the interface);
//   · guides/ reads another app only through that app's public.js (a link is a pointer by id;
//     the editor's picker asks the owner for names and never writes there).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(svelte|js|ts)$/.test(p)) out.push(p);
  }
  return out;
}
const norm = (p) => p.replace(/\\/g, '/');
const files = walk('src').map(norm);
const inside = (p) => p.startsWith('src/lib/apps/guides/');
// `guides` alone is also the app's id (apps.js, the router), so the bare name only counts as a TABLE
// when it is the first argument of an api call / .from().
const TABLES = /['"`](guide_steps|guide_versions|guide_links|guide_categories|guide_collections|guide_collection_items)['"`]|(?:api\.\w+|from)\(\s*['"`]guides['"`]/;

describe('Guides boundary', () => {
  it('other apps import only guides/public.js', () => {
    const bad = [];
    for (const f of files.filter((x) => !inside(x) && !x.endsWith('.test.js'))) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/from\s+['"]#lib\/apps\/guides\/([^'"]+)['"]|import\(\s*['"]#lib\/apps\/guides\/([^'"]+)['"]/g)) {
        const target = m[1] ?? m[2];
        // the app shell is loaded by the router, once, by name; GuideHelp is the one standard-theme view other apps may embed; guideWorkflow.js is the shipped workflow seed the workflow manager lists (every app's seed is read the same way)
        if (target !== 'public.js' && target !== 'GuidesApp.svelte' && target !== 'components/GuideHelp.svelte' && target !== 'utils/guideWorkflow.js') bad.push(`${f} → ${target}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('no file outside guides/ names a guide table', () => {
    const allowed = ['src/lib/database.types.ts', 'src/lib/server/dbRules/dbRulesParity.test.js'];
    const bad = files.filter((f) => !inside(f) && !allowed.includes(f) && !f.includes('.test.')
      && TABLES.test(fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('guides/ reaches another app only through its public.js (to name a record in a link picker)', () => {
    const bad = [];
    for (const f of files.filter((x) => inside(x) && !x.endsWith('.test.js'))) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/from\s+['"]#lib\/apps\/([a-z_]+)\/([^'"]+)['"]/g)) {
        if (m[1] !== 'guides' && m[2] !== 'public.js') bad.push(`${f} → ${m[1]}/${m[2]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the scan still finds what it is for (a dead guard is no guard)', () => {
    expect(files.filter(inside).length).toBeGreaterThan(3);
    expect(files.some((f) => f === 'src/routes/+page.svelte')).toBe(true);
  });
});
