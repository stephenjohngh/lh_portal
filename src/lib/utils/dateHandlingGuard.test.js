// src/lib/utils/dateHandlingGuard.test.js
//
// Dates have one owner: src/lib/utils/dates.js. This test fails any other
// source file that does date work by hand.
//
// ⛔ WHY (2026-10-02). Dates caused more bugs here than any other single thing,
// and every one was the same fault in a new place — a clock mixed with
// another clock:
//   · the BST infinite loop in the maintenance generator (2026-09-10): a date
//     stepped in LOCAL time and read back in UTC;
//   · the Capital Plan showing every summer renewal a day early, while the
//     Word plan, computed differently, showed the right date;
//   · MOR's dashboard starting April's and July's quarter on the day before;
//   · "today" written by hand 56 times as the UTC date — yesterday, between
//     midnight and 1 am all summer;
//   · Word documents, made on a UTC server, printing times an hour behind.
// Each was fixed where it was found, and the next one was written the same way
// somewhere else. So the rule is enforced rather than remembered.
//
// THE RULE — outside dates.js, never:
//   · cut a date out of toISOString()        → today(), calendarDate(), addDaysISO()
//   · write a day as milliseconds            → DAY_MS, daysBetween(), daysUntil()
//   · step a Date with a LOCAL setter        → addDaysISO(), addMonthsISO(), addDaysLondon()
//     (setDate / setMonth / setFullYear / setHours)
//   · format with toLocaleDateString / -TimeString → fmtDate() and friends, in London time
// A legitimate exception is added to ALLOWED by name, with its reason.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every .js and .svelte source file under src/, tests excluded. */
function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { sources(path, out); continue; }
    if (/\.test\.js$/.test(name)) continue;
    if (/\.(js|svelte)$/.test(name)) out.push(path.replace(/\\/g, '/'));
  }
  return out;
}

// Built from strings: Vite's import scanner reads a quote inside a regex
// literal as the start of a string and refuses the file.
const RULES = {
  'cuts a date out of toISOString()':
    new RegExp("\\.toISOString\\(\\)\\.(slice\\(0, ?10\\)|split\\('T'\\)\\[0\\]|substring\\(0, ?10\\))"),
  'writes a day as milliseconds':
    new RegExp('86400000|86_400_000|864e5|(24 \\* 60 \\* 60|60 \\* 60 \\* 24) \\* 1000|1000 \\* 60 \\* 60 \\* 24|1000 \\* 3600 \\* 24'),
  'steps a Date with a local setter':
    new RegExp('\\.set(Date|Month|FullYear|Hours)\\('),
  'formats a date outside dates.js':
    new RegExp('\\.toLocale(Date|Time)String\\('),
};

/** file → rule → why it is allowed there. */
const ALLOWED = {
  'src/lib/apps/mor/public.js': {
    'cuts a date out of toISOString()':
      'The Planner’s MOR deadline: the UTC date of the deadline INSTANT, deliberately — near midnight under BST it reads a day early, the safe direction for a statutory deadline.',
  },
};

const OWNER = 'src/lib/utils/dates.js';

/** Code lines only: a comment that NAMES the old way is not doing it. */
function codeLines(source) {
  return source.split('\n').map((text, i) => ({ text, line: i + 1 }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(text));
}

const FILES = sources('src');

describe('dates have one owner (dates.js)', () => {
  it('finds the sources it exists for', () => {
    expect(FILES.length).toBeGreaterThan(300);
    expect(FILES).toContain(OWNER);
    expect(FILES).toContain('src/lib/apps/maintenance/utils/tenYearPlan.js');
  });

  for (const [rule, pattern] of Object.entries(RULES)) {
    it(`no file ${rule}`, () => {
      const offenders = [];
      for (const file of FILES) {
        if (file === OWNER || ALLOWED[file]?.[rule]) continue;
        for (const { text, line } of codeLines(readFileSync(file, 'utf8'))) {
          if (pattern.test(text)) offenders.push(`${file}:${line}  ${text.trim().slice(0, 90)}`);
        }
      }
      expect(offenders, `${rule} — use dates.js instead:\n${offenders.join('\n')}`).toEqual([]);
    });
  }

  it('every exception still has something to excuse', () => {
    for (const [file, rules] of Object.entries(ALLOWED)) {
      const code = codeLines(readFileSync(file, 'utf8')).map((l) => l.text).join('\n');
      for (const rule of Object.keys(rules)) {
        expect(RULES[rule], `unknown rule in ALLOWED: ${rule}`).toBeTruthy();
        expect(RULES[rule].test(code), `${file} no longer ${rule}; remove the exception`).toBe(true);
      }
    }
  });

  it('recognises each old habit, and ignores one named in a comment', () => {
    const old = [
      "const t = new Date().toISOString().slice(0, 10);",
      "return d.toISOString().split('T')[0];",
      "const days = ms / 86400000;",
      "const ttl = 24 * 60 * 60 * 1000;",
      "d.setDate(d.getDate() + 7);",
      "x.toLocaleDateString('en-GB')",
    ];
    for (const line of old) {
      expect(Object.values(RULES).some((r) => r.test(line)), line).toBe(true);
    }
    expect(codeLines('// d.setDate(d.getDate() + 1)\nconst ok = 1;').map((l) => l.text)).toEqual(['const ok = 1;']);
  });
});
