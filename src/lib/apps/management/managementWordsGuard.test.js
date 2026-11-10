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

  // Who added or changed something is shown by SHORT NAME (initials), the full
  // name only where none is set (user, 2026-11-10) — on screen, on the phone and
  // in the Word reports. shortLabel (#lib/utils/personLabels.js) does both.
  // ⚠ public.js is left out: it builds a Dossier pack, which goes outside and
  // keeps full names.
  it('names who added or changed a thing by short name', () => {
    const scanned = [...files('src/lib/apps/management'), ...files('src/lib/apps/managementmobile'), 'src/lib/server/managementDocx.js']
      .filter(p => !/[\\/]management[\\/]public\.js$/.test(p) && !/issueDossierPlan\.js$/.test(p));
    const bad = scanned.filter(p => /_by_profile\??\.full_name/.test(readFileSync(p, 'utf8')));
    expect(bad).toEqual([]);
    // ⛔ A file that calls shortLabel without importing it compiles, passes
    // `npm run check`, and blanks the whole app with a 500 at run time
    // (IssueCard, 2026-11-10).
    const unimported = scanned.filter((p) => {
      const s = readFileSync(p, 'utf8');
      return /shortLabel\(/.test(s) && !/import\s*\{[^}]*\bshortLabel\b[^}]*\}\s*from/.test(s);
    });
    expect(unimported).toEqual([]);
    // The query must bring the short name, or every line falls back to the full name.
    const store = readFileSync('src/lib/apps/management/stores/issuesStore.js', 'utf8');
    expect(store).not.toMatch(/profiles!(created|updated)_by\(full_name\)/);
  });
});
