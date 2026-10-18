// One set of item controls (2026-10-18 review): Parking Applications,
// Complaints and Cases each had a hand-made copy of the moves, the reasons a
// move is held, the note, who it is with, the history and the record — and
// they had already drifted (Complaints had no record; a wording fix had to be
// made twice). They now share #lib/workflow/WorkflowItemControls.svelte.
//
// ⛔ A screen outside #lib/workflow that works out the moves or their reasons,
// or builds an item's record, is a new copy. Put what is the app's own in the
// controls' props (onMove, onAssign, extraRefusal, confirmMove, record) or slot.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');
const COPY = /\b(movesFrom|moveRefusal|itemRecordModel|buildItemRecord)\b/;

/** @param {string} dir @returns {string[]} */
function svelteFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? svelteFiles(p) : p.endsWith('.svelte') ? [p] : [];
  });
}

describe('workflow item controls are shared', () => {
  const files = svelteFiles(ROOT).map((p) => ({ path: relative(process.cwd(), p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }));

  it('no screen outside #lib/workflow works out the moves, their reasons or the record itself', () => {
    const copies = files.filter((f) => !f.path.startsWith('src/lib/workflow/') && COPY.test(f.text)).map((f) => f.path);
    expect(copies, 'use #lib/workflow/WorkflowItemControls.svelte').toEqual([]);
  });

  it('the apps with items use the shared controls (the scan reaches them)', () => {
    for (const p of ['src/lib/apps/parking/components/ApplicationsTab.svelte',
      'src/lib/apps/complaints/components/ComplaintDetail.svelte', 'src/lib/apps/cases/components/CasePanel.svelte']) {
      expect(files.find((f) => f.path === p)?.text ?? '', p).toMatch(/WorkflowItemControls/);
    }
  });
});
