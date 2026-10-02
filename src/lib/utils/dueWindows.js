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
// ⚠ THE NUMBERS BELOW ARE THE ONES EACH APP USED when they were gathered.
// Nothing was harmonised: whether a contractor duty needs 60 days' notice
// or 30 is the duty holder's call, not a code tidy-up. Changing a window is now
// a one-line edit here, and the screen text that names it follows (Maintenance's
// "Due within N days" reads this list).
//
// Days are London calendar days (dates.js); a thing is overdue the day AFTER
// its date, and due soon from `soonDays` days before it up to and including it.

import { daysUntil } from './dates.js';

// Declared, then frozen: freezing the literal directly makes the type checker
// read each window as its exact number (the TYPE 60), so no other number
// could ever be passed where a window is expected.
const windows = {
  /** Maintenance → Due work and All jobs: a scheduled job. */
  maintenanceJob: 30,
  /** A certificate's expiry: Maintenance's documents, Due work's band, the Planner. */
  certificateExpiry: 60,
  /** A document in the shared library (Admin → Document Demo, attached documents). */
  documentExpiry: 30,
  /** A planned obligation's next due date (Compliance position, scheduler, walks). */
  plannedObligation: 14,
  /** A "not applicable" decision coming up for review. */
  exclusionReview: 30,
  /** A Display register (s.82) item coming up for review. */
  displayItemReview: 30,
  /** A published Dossier link: "Expires in N days" from this many days out. */
  dossierLinkExpiry: 14,
  /** Planner: a contractor duty with nothing booked — "needs arranging". */
  plannerArranging: 60,
  /** Planner: an in-house walk — no booking, the ordinary notice. */
  plannerWalk: 14,
  /** Planner: an event of its own with no lead time set. */
  plannerDefaultNotice: 30,
  /** Planner: a Golden Thread person's competence expiring. */
  plannerCompetenceExpiry: 60,
  /** Planner: the MOR 10-day BSR report deadline. */
  plannerBsrDeadline: 10,
  /** Capital Plan: a renewal within this many days reads "soon". */
  capitalRenewal: 365,
};

/** How many days ahead each thing counts as "due soon". */
export const DUE_SOON_DAYS = Object.freeze(windows);

// ⚠ Golden Thread's document reviews are deliberately NOT here: they use a
// graded scale (due within 30 / 60 / 90 days), not one window — gtReview.js.

/**
 * 'overdue' | 'due_soon' | 'ok' for a number of days until something is due.
 * null when there is no number (no date, or an unreadable one).
 * @param {number|null|undefined} days  from daysUntil(); negative once passed
 * @param {number} soonDays             a DUE_SOON_DAYS window
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
