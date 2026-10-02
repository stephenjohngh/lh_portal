// src/lib/utils/dueWindows.js
//
// "Overdue", "due soon" or neither — ONE rule, and every app's "soon" window
// in ONE list (2026-10-02, PROJECT_STATUS §6aaa item 2).
//
// Due DATES already come from one place each (standing decision: "what is due
// is answered in ONE place"). The WINDOWS did not: each app picked its own
// number in its own file — Maintenance jobs 30 days, certificates 60, planned
// obligations 14, the Planner 60/14/10, Dossier links 14 — so one job could be
// amber in Maintenance and not yet "coming up" in the Planner, and nobody
// could see that without reading six files.
//
// ⭐ THE NUMBERS ARE AN ADMIN SETTING (2026-10-02): Admin → Other Config → Due
// windows. Each window below is the SHIPPED DEFAULT — the number each app used
// when they were gathered. Nothing was harmonised: whether a contractor duty
// needs 60 days' notice or 30 is the duty holder's call, not a code tidy-up.
//
// Where an admin's choice lives: `portal_settings`, key `due_soon_days`, as the
// windows that DIFFER from the default. The shell loads it before any app
// opens (portalSettings.load) and hands it to setDueWindows(). A window an admin
// never changed follows the shipped default, so a later release that adds or
// changes a default reaches this building with nobody pressing anything —
// the same rule as the compliance register's seed.
//
// ⛔ READ A WINDOW WHEN IT IS USED — dueSoonDays('maintenanceJob') inside the
// function — never once at module scope (`const X = dueSoonDays(...)`). A
// module is loaded before the setting arrives, so a captured number is the
// default for the life of the page. dueWindows.test.js fails any file that does.
//
// Days are London calendar days (dates.js); a thing is overdue the day AFTER
// its date, and due soon from `soonDays` days before it up to and including it.

import { daysUntil } from './dates.js';

// One entry per window: the shipped default, and what an admin is shown.
// Declared, then frozen, so the type checker reads `days` as a number rather
// than as its exact value.
const WINDOWS = {
  maintenanceJob: {
    days: 30, app: 'Maintenance', label: 'A scheduled maintenance job',
    where: 'Due work, All jobs and the summary counts show a job as due soon.',
  },
  certificateExpiry: {
    days: 60, app: 'Maintenance · Planner', label: 'A certificate expiring',
    where: 'Maintenance’s documents and certificate count, and the Planner’s certificate rows.',
  },
  documentExpiry: {
    days: 30, app: 'Documents', label: 'A library document expiring',
    where: 'Attached documents and Admin → Document Demo.',
  },
  plannedObligation: {
    days: 14, app: 'Compliance', label: 'A planned obligation falling due',
    where: 'The compliance position, its Word report and the walks due list.',
  },
  exclusionReview: {
    days: 30, app: 'Compliance', label: 'A “not applicable” decision due for review',
    where: 'The compliance obligations register’s review count and badges.',
  },
  displayItemReview: {
    days: 30, app: 'Compliance', label: 'A display register (s.82) item due for review',
    where: 'The display register.',
  },
  dossierLinkExpiry: {
    days: 14, app: 'Dossier', label: 'A published link expiring',
    where: 'A publication reads “Expires in N days” from this many days out.',
  },
  plannerArranging: {
    days: 60, app: 'Planner', label: 'A contractor duty with nothing booked',
    where: 'Appears under “Needs arranging” this many days before it is due.',
  },
  plannerWalk: {
    days: 14, app: 'Planner', label: 'An in-house inspection walk',
    where: 'Appears as coming up this many days before it is due.',
  },
  plannerDefaultNotice: {
    days: 30, app: 'Planner', label: 'A Planner event with no notice of its own',
    where: 'Used when an event does not set its own notice period.',
  },
  plannerCompetenceExpiry: {
    days: 60, app: 'Planner', label: 'A person’s competence expiring',
    where: 'Golden Thread competence dates on the Planner.',
  },
  plannerBsrDeadline: {
    days: 10, app: 'Planner', label: 'The MOR 10-day report to the regulator',
    where: 'The whole clock is ten days, so ten shows it from the day it starts.',
  },
  capitalRenewal: {
    days: 365, app: 'Maintenance', label: 'A capital renewal',
    where: 'The Capital Plan marks a renewal due within this many days as soon.',
  },
};

/** @typedef {keyof typeof WINDOWS} DueWindowKey */

/** The smallest and largest window an admin may set, in days. */
export const DUE_WINDOW_LIMITS = Object.freeze({ min: 0, max: 3650 });

/** Every window, in the order an admin is shown them. */
export const DUE_WINDOW_KEYS = /** @type {ReadonlyArray<DueWindowKey>} */ (
  Object.freeze(Object.keys(WINDOWS))
);

/** The shipped default for each window. */
export const DUE_SOON_DEFAULTS = /** @type {Readonly<Record<DueWindowKey, number>>} */ (
  Object.freeze(Object.fromEntries(DUE_WINDOW_KEYS.map((k) => [k, WINDOWS[k].days])))
);

/**
 * What an admin is shown for each window.
 * @returns {Array<{ key: DueWindowKey, app: string, label: string, where: string, defaultDays: number }>}
 */
export function dueWindowInfo() {
  return DUE_WINDOW_KEYS.map((key) => {
    const { app, label, where, days } = WINDOWS[key];
    return { key, app, label, where, defaultDays: days };
  });
}

/** @type {Record<DueWindowKey, number>} */
let active = { ...DUE_SOON_DEFAULTS };

/**
 * How many days ahead this thing counts as due soon — the admin's setting, or
 * the shipped default. Call it where the number is used (see the header).
 * @param {DueWindowKey} key
 * @returns {number}
 */
export function dueSoonDays(key) {
  return active[key] ?? DUE_SOON_DEFAULTS[key];
}

/**
 * Is this a window an admin may set?
 * @param {unknown} days
 */
export function isValidWindow(days) {
  return Number.isInteger(days)
    && /** @type {number} */ (days) >= DUE_WINDOW_LIMITS.min
    && /** @type {number} */ (days) <= DUE_WINDOW_LIMITS.max;
}

/**
 * The windows worth storing, from whatever was saved or typed: known keys only,
 * whole numbers in range only, and only where they DIFFER from the default —
 * a window set back to its default follows the default again.
 * @param {unknown} raw  `{ key: days }`
 * @returns {Partial<Record<DueWindowKey, number>>}
 */
export function cleanDueWindows(raw) {
  /** @type {Partial<Record<DueWindowKey, number>>} */
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of DUE_WINDOW_KEYS) {
    const days = /** @type {any} */ (raw)[key];
    if (isValidWindow(days) && days !== DUE_SOON_DEFAULTS[key]) out[key] = days;
  }
  return out;
}

/**
 * Put an admin's windows in force; null puts every default back.
 * Returns the windows that differ from the default.
 * @param {unknown} raw
 */
export function setDueWindows(raw) {
  const changed = cleanDueWindows(raw);
  active = { ...DUE_SOON_DEFAULTS, ...changed };
  return changed;
}

/** Every window in force, as a copy. */
export function activeDueWindows() {
  return { ...active };
}

// ⚠ Golden Thread's document reviews are deliberately NOT here: they use a
// graded scale (due within 30 / 60 / 90 days), not one window — gtReview.js.

/**
 * 'overdue' | 'due_soon' | 'ok' for a number of days until something is due.
 * null when there is no number (no date, or an unreadable one).
 * @param {number|null|undefined} days  from daysUntil(); negative once passed
 * @param {number} soonDays             dueSoonDays(...) for the thing
 * @returns {'overdue'|'due_soon'|'ok'|null}
 */
export function dueBand(days, soonDays) {
  if (days == null || Number.isNaN(days)) return null;
  if (days < 0) return 'overdue';
  if (days <= soonDays) return 'due_soon';
  return 'ok';
}

/**
 * The band for a date, counted from today in London.
 * @param {string|null|undefined} dateISO  'YYYY-MM-DD', or a timestamp
 * @param {number} soonDays
 * @param {string} [fromISO]               today, for tests
 */
export function dueBandOf(dateISO, soonDays, fromISO) {
  if (!dateISO) return null;
  return dueBand(daysUntil(dateISO, fromISO), soonDays);
}
