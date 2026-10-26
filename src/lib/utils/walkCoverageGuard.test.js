// ⛔ A duty is judged against everything it covers, across walks and days — not
// by whether one walk checked everything in ITS OWN session (walkCoverage.js).
// The old per-session rule let a walk of 7 of a duty's 104 components read as
// the whole duty done. It is still in the code, because the scheduler's own
// tests pin it, and the only thing keeping it out of the screens is this guard.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(js|svelte)$/.test(name) && !/\.test\.js$/.test(name)) out.push(p);
  }
  return out;
}
const files = sources('src').map((p) => [p.replace(/\\/g, '/'), readFileSync(p, 'utf8')]);

describe('walk evidence is judged by coverage', () => {
  it('the scan sees the callers it exists for', () => {
    const callers = files.filter(([, t]) => t.includes('computeInspectionSchedule('));
    expect(callers.length).toBeGreaterThanOrEqual(2);
  });

  it('every caller of computeInspectionSchedule passes coverage', () => {
    const bad = [];
    for (const [path, text] of files) {
      if (/utils\/(inspectionSchedule|obligationSchedule)\.js$/.test(path)) continue;   // the definition, and a comment
      for (const m of text.matchAll(/computeInspectionSchedule\(/g)) {
        const call = text.slice(m.index, m.index + 400);
        if (!/coverage/.test(call)) bad.push(path);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nothing but the scheduler builds walk events from sessions alone', () => {
    const allowed = ['utils/obligationSchedule.js', 'utils/inspectionSchedule.js', 'utils/walkCoverage.js'];
    const bad = files
      .filter(([path, t]) => /walkEventsFromSessions\(/.test(t) && !allowed.some((a) => path.endsWith(a)))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });
});
