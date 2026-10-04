// src/lib/utils/sharedLabelsGuard.test.js
//
// Words the portal shows for its own values are written ONCE (2026-10-02,
// PROJECT_STATUS §6aaa item 7):
//   · issue priorities and action statuses → #lib/utils/constants.js
//     (getPriorityLabel, getActionStatusLabel);
//   · component statuses → #lib/utils/resultConstants.js (statusLabel);
//   · a thrown value as text → #lib/utils/errors.js (errMessage).
// The phone issues app, Mobile Plan, the plan marker and the component Word
// report each kept their own copy. A copy agrees until the day one changes.
// Colours are NOT checked: the phone apps have their own theme.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { statusLabel } from './resultConstants.js';
import { getActionStatusLabel, getPriorityLabel, ACTION_STATUS } from './constants.js';
import { STATUS_LABELS, resultLabel } from '#lib/apps/mobileplan/utils/planFilter.js';

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { sources(path, out); continue; }
    if (/\.test\.js$/.test(name)) continue;
    if (/\.(js|svelte)$/.test(name)) out.push(path.replace(/\\/g, '/'));
  }
  return out;
}

const code = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// Built from strings: Vite's import scanner misreads some regex literals.
const RULES = [
  { what: 'an issue priority word', owner: 'src/lib/utils/constants.js',
    use: 'getPriorityLabel(p).label', pattern: new RegExp("'(Top Priority|Major Project)'"),
    sample: "  1: 'Top Priority'," },
  { what: 'an action status word', owner: 'src/lib/utils/constants.js',
    use: 'getActionStatusLabel(status)', pattern: new RegExp("'in-progress'\\s*:\\s*'[A-Za-z]"),
    sample: "  const ACTION_LABEL = { 'in-progress': 'In Progress' };" },
  { what: 'a component status word', owner: 'src/lib/utils/resultConstants.js',
    use: 'statusLabel(status)', pattern: new RegExp("\\b(problem|failed)\\s*:\\s*'[^'#]*\\b(Problem|Failed)\\b"),
    sample: "const STATUS_LABEL = { ok: 'OK', problem: 'Problem', failed: 'Failed' };" },
  { what: 'a thrown value as text', owner: 'src/lib/utils/errors.js',
    use: 'errMessage(err)', pattern: new RegExp('\\?\\.message \\?\\? String\\(|instanceof Error \\?'),
    sample: '      checkError = err?.message ?? String(err);' },
];

describe('shared labels are written once', () => {
  const files = sources('src');
  const texts = new Map(files.map((f) => [f, code(readFileSync(f, 'utf8'))]));

  it('finds the files it exists for', () => {
    for (const f of ['src/lib/utils/constants.js', 'src/lib/utils/resultConstants.js',
      'src/lib/apps/managementmobile/components/IssueDetailScreen.svelte',
      'src/lib/apps/mobileplan/utils/planFilter.js']) expect(files).toContain(f);
  });

  for (const rule of RULES) {
    it(`no file but its owner writes out ${rule.what}`, () => {
      const offenders = files.filter((f) => f !== rule.owner && rule.pattern.test(texts.get(f)));
      expect(offenders, `use ${rule.use} from ${rule.owner}`).toEqual([]);
    });
    it(`recognises a hand-written ${rule.what}`, () => {
      expect(rule.pattern.test(rule.sample)).toBe(true);
    });
  }

  it('does not mistake a colour map for a label map', () => {
    expect(RULES[1].pattern.test("  'in-progress': '#818cf8',")).toBe(false);
  });
});

describe('the shared helpers', () => {
  it('statusLabel never calls an unknown status OK', () => {
    expect(statusLabel('failed')).toBe('Failed');
    expect(statusLabel('mystery')).toBe('mystery');
    expect(statusLabel(null)).toBe('—');
  });

  it('getActionStatusLabel reads the options list, and shows an unknown value as itself', () => {
    expect(getActionStatusLabel(ACTION_STATUS.IN_PROGRESS)).toBe('In Progress');
    expect(getActionStatusLabel('blocked')).toBe('blocked');
    expect(getActionStatusLabel(null)).toBe('');
  });

  it("an unknown priority reads as the desktop's fallback", () => {
    expect(getPriorityLabel(99).label).toBe('Important');
  });

  it("Mobile Plan's labels carry the portal's words behind its symbols", () => {
    for (const s of ['ok', 'problem', 'failed', 'inactive']) {
      expect(STATUS_LABELS[s].endsWith(` ${statusLabel(s)}`)).toBe(true);
      expect(resultLabel(s)).toBe(STATUS_LABELS[s]);
    }
    expect(resultLabel('no_access')).toBe('⊘ No access');
    expect(resultLabel('toString')).toBe('toString');
    expect(resultLabel(undefined)).toBe('—');
  });
});
