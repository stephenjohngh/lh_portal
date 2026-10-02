// src/lib/utils/dueWindows.test.js
// One rule for overdue / due soon, every app's window in one list, and the
// windows an admin sets (Admin → Due windows) reaching every app.

import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  DUE_SOON_DEFAULTS, DUE_WINDOW_KEYS, DUE_WINDOW_LIMITS,
  dueBand, dueBandOf, dueSoonDays, dueWindowInfo,
  cleanDueWindows, setDueWindows, activeDueWindows, isValidWindow,
} from './dueWindows.js';
import { getExpiryStatus } from './documentUtils.js';
import { reviewState } from './statutoryExclusions.js';
import { expiryRag, jobRag } from '$lib/apps/maintenance/utils/maintenanceHelpers.js';
import { fromObligationDue } from '$lib/apps/planner/utils/linked.js';
import { bucketOf } from '$lib/apps/planner/utils/agenda.js';
import { addDaysISO, today } from './dates.js';

afterEach(() => { setDueWindows(null); });

describe('dueBand', () => {
  it('is overdue the day after, due soon up to and including the date', () => {
    expect(dueBand(-1, 30)).toBe('overdue');
    expect(dueBand(0, 30)).toBe('due_soon');
    expect(dueBand(30, 30)).toBe('due_soon');
    expect(dueBand(31, 30)).toBe('ok');
  });
  it('has no band without a number', () => {
    expect(dueBand(null, 30)).toBeNull();
    expect(dueBand(NaN, 30)).toBeNull();
    expect(dueBandOf(null, 30)).toBeNull();
  });
  it('counts London calendar days from a given today', () => {
    expect(dueBandOf('2026-10-16', 14, '2026-10-02')).toBe('due_soon');
    expect(dueBandOf('2026-10-17', 14, '2026-10-02')).toBe('ok');
    expect(dueBandOf('2026-10-01', 14, '2026-10-02')).toBe('overdue');
  });
});

// The defaults were gathered as each app had them; harmonising them is a
// decision, so this pins them until somebody makes it on purpose.
describe('the shipped defaults', () => {
  it('hold each app’s window as it was', () => {
    expect(DUE_SOON_DEFAULTS).toEqual({
      maintenanceJob: 30, certificateExpiry: 60, documentExpiry: 30,
      plannedObligation: 14, exclusionReview: 30, displayItemReview: 30,
      dossierLinkExpiry: 14, plannerArranging: 60, plannerWalk: 14,
      plannerDefaultNotice: 30, plannerCompetenceExpiry: 60,
      plannerBsrDeadline: 10, capitalRenewal: 365,
    });
  });
  it('cannot be changed by accident at run time', () => {
    expect(Object.isFrozen(DUE_SOON_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(DUE_WINDOW_KEYS)).toBe(true);
  });
  it('are each a window an admin could set, and each says what it governs', () => {
    for (const w of dueWindowInfo()) {
      expect(isValidWindow(w.defaultDays), w.key).toBe(true);
      expect(w.app.trim(), w.key).not.toBe('');
      expect(w.label.trim(), w.key).not.toBe('');
      expect(w.where.trim(), w.key).not.toBe('');
    }
    expect(dueWindowInfo().map((w) => w.key)).toEqual([...DUE_WINDOW_KEYS]);
  });
});

describe('an admin’s windows', () => {
  it('are used where set, and the defaults everywhere else', () => {
    setDueWindows({ maintenanceJob: 45 });
    expect(dueSoonDays('maintenanceJob')).toBe(45);
    expect(dueSoonDays('certificateExpiry')).toBe(60);
    setDueWindows(null);
    expect(dueSoonDays('maintenanceJob')).toBe(30);
  });

  it('keep only known windows, whole numbers in range, and those off the default', () => {
    expect(cleanDueWindows({
      maintenanceJob: 45,                         // kept
      certificateExpiry: 60,                      // the default — follows it
      documentExpiry: 2.5,                        // not whole
      plannedObligation: -1,                      // below range
      exclusionReview: DUE_WINDOW_LIMITS.max + 1, // above range
      displayItemReview: '20',                    // text
      plannerWalk: 0,                             // 0 is allowed: due soon only on the day
      notAWindow: 5,                              // unknown
    })).toEqual({ maintenanceJob: 45, plannerWalk: 0 });
  });

  it('ignore anything that is not a map of windows', () => {
    for (const raw of [null, undefined, 42, 'x', [30], true]) {
      expect(cleanDueWindows(raw)).toEqual({});
    }
  });

  it('are handed out as a copy, so nothing outside can change them', () => {
    setDueWindows({ maintenanceJob: 45 });
    const copy = activeDueWindows();
    copy.maintenanceJob = 1;
    expect(dueSoonDays('maintenanceJob')).toBe(45);
  });
});

// Each app reads its window when it is used, so a setting that arrives after
// the module loaded still reaches it. These fail if any reverts to a constant.
describe('the apps follow the setting', () => {
  const t = today();

  it('a maintenance job', () => {
    const job = (n) => ({ status: 'scheduled', scheduled_date: addDaysISO(t, n) });
    expect(jobRag(job(40))).toBe('scheduled');
    setDueWindows({ maintenanceJob: 45 });
    expect(jobRag(job(40))).toBe('due_soon');
  });

  it('a certificate and a library document', () => {
    const in40 = addDaysISO(t, 40);
    expect(expiryRag(in40)).toBe('expiring');
    expect(getExpiryStatus(in40)).toBe('ok');
    setDueWindows({ certificateExpiry: 20, documentExpiry: 50 });
    expect(expiryRag(in40)).toBe('valid');
    expect(getExpiryStatus(in40)).toBe('expiring-soon');
  });

  it('a "not applicable" decision’s review', () => {
    const in40 = addDaysISO(t, 40);
    expect(reviewState(in40, { today: t })).toBe('scheduled');
    setDueWindows({ exclusionReview: 45 });
    expect(reviewState(in40, { today: t })).toBe('due_soon');
  });

  it('the Planner’s "needs arranging"', () => {
    const TODAY = '2026-09-23';
    const row = {
      id: 'o1', name: 'Fire alarm service', route: 'maintenance_job',
      nextDue: '2026-10-10T00:00:00.000Z', overdue: false, band: 'ok', booked: false,
    };
    expect(bucketOf(fromObligationDue(row, TODAY), TODAY)).toBe('arranging');
    setDueWindows({ plannerArranging: 5 });
    expect(bucketOf(fromObligationDue(row, TODAY), TODAY)).toBe('planned');
  });

  it('keep agreeing with each other at the boundary', () => {
    expect(getExpiryStatus(t)).toBe('expiring-soon');
    expect(expiryRag(t)).toBe('expiring');
    expect(getExpiryStatus(addDaysISO(t, -1))).toBe('expired');
    expect(expiryRag(addDaysISO(t, -1))).toBe('expired');
  });
});

// ── The guards ──────────────────────────────────────────────────────────────
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
const OWNER = 'src/lib/utils/dueWindows.js';
const PANEL = 'src/lib/apps/admin/components/DueWindowsPanel.svelte';
const FILES = sources('src').filter((f) => f !== OWNER);
const read = (f) => readFileSync(f, 'utf8');
const code = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l));

// Pure functions, so the rules can be proved against the old habits below.
const CAPTURE    = /^(export\s+)?(const|let|var)\s+\w+\s*=.*dueSoonDays\(/;
const TYPED_DAYS = /[Dd]ue within \d+ days|[Ee]xpiring within \d+ days/;

describe('every window is set in one place and read where it is used', () => {
  it('finds the sources it exists for', () => {
    expect(FILES.length).toBeGreaterThan(300);
    expect(FILES).toContain('src/lib/apps/maintenance/utils/maintenanceHelpers.js');
    expect(FILES).toContain(PANEL);
  });

  it('no .js file copies a window into a module-level constant', () => {
    // A module loads before the admin's windows arrive, so a captured number
    // is the shipped default for the life of the page.
    const offenders = [];
    for (const f of FILES.filter((x) => x.endsWith('.js'))) {
      for (const [i, line] of read(f).split('\n').entries()) {
        if (CAPTURE.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim()}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('no screen types a window’s number into its text', () => {
    const offenders = [];
    for (const f of FILES.filter((x) => x.endsWith('.svelte'))) {
      for (const line of code(read(f))) {
        if (TYPED_DAYS.test(line)) offenders.push(`${f}  ${line.trim()}`);
      }
    }
    expect(offenders, `use dueSoonDays(...) in the text:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('only dueWindows.js knows the defaults; everything else asks for the window in force', () => {
    const offenders = FILES.filter((f) => /DUE_SOON_DEFAULTS|DUE_SOON_DAYS/.test(code(read(f)).join('\n')));
    expect(offenders).toEqual([]);
  });

  it('every window an admin can set is used by some screen', () => {
    // A window nothing reads is a setting that silently does nothing.
    const users = FILES.filter((f) => f !== PANEL).map(read);
    for (const key of DUE_WINDOW_KEYS) {
      const used = users.some((text) => (text.includes('dueSoonDays(') && text.includes(`'${key}'`))
        || text.includes(`windows.${key}`));
      expect(used, `${key} is never read`).toBe(true);
    }
  });

  it('recognises each old habit', () => {
    expect(CAPTURE.test("export const ARRANGING_LEAD_DAYS = dueSoonDays('plannerArranging');")).toBe(true);
    expect(CAPTURE.test("const WALK = dueSoonDays('plannerWalk');")).toBe(true);
    expect(CAPTURE.test("  const soonDays = opts.dueSoonDays ?? dueSoonDays('plannedObligation');")).toBe(false);
    expect(TYPED_DAYS.test('<div class="stat-label">Due within 30 days</div>')).toBe(true);
    expect(TYPED_DAYS.test("Due within {dueSoonDays('maintenanceJob')} days")).toBe(false);
  });
});
