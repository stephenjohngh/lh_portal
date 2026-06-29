// src/lib/apps/golden_thread/utils/gtReview.js
//
// Pure review-due logic for the Golden Thread register. Used both by the
// read-time UI (review-status badges in the register/detail) and by the
// review-tick scheduler entrypoint (/api/cron/review-tick). No DB, no I/O —
// Type-1 testable (gtReview.test.js).
//
// Bands (days until review_due): overdue (<0), then 0–30 / 31–60 / 61–90.
// Beyond 90 days a current document is "not due soon" and isn't counted.

/** @typedef {'overdue'|'due_30'|'due_60'|'due_90'|null} ReviewBand */

/** Whole days between two ISO dates (YYYY-MM-DD), b - a. UTC, calendar-day based. */
export function daysBetween(aISO, bISO) {
  const a = Date.parse(aISO + 'T00:00:00Z');
  const b = Date.parse(bISO + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

/**
 * Band a document falls into given days-until-review. null = not due soon (>90)
 * or no review date.
 * @param {number|null} daysToReview
 * @returns {ReviewBand}
 */
export function reviewBand(daysToReview) {
  if (daysToReview == null) return null;
  if (daysToReview < 0)  return 'overdue';
  if (daysToReview <= 30) return 'due_30';
  if (daysToReview <= 60) return 'due_60';
  if (daysToReview <= 90) return 'due_90';
  return null;
}

/**
 * Days until a document's review is due (review_due - today), or null when the
 * document has no review date.
 * @param {{ review_due?: string|null }} doc
 * @param {string} todayISO
 * @returns {number|null}
 */
export function daysToReview(doc, todayISO) {
  if (!doc.review_due) return null;
  return daysBetween(todayISO, doc.review_due);
}

/**
 * Idempotent, read-only review tick: over the CURRENT documents, count how many
 * are due-soon / overdue and break them down by band. This is what the cron
 * entrypoint returns; it writes nothing (MVP has no notification surface).
 * @param {Array<{ status?: string, review_due?: string|null }>} docs
 * @param {string} todayISO
 * @returns {{ checked: number, dueSoon: number, overdue: number, byBand: Record<string, number> }}
 */
export function computeReviewTick(docs, todayISO) {
  const byBand = { overdue: 0, due_30: 0, due_60: 0, due_90: 0 };
  let checked = 0, dueSoon = 0, overdue = 0;
  for (const d of docs) {
    if (d.status !== 'current' || !d.review_due) continue;
    checked++;
    const band = reviewBand(daysToReview(d, todayISO));
    if (!band) continue;
    byBand[band]++;
    if (band === 'overdue') overdue++; else dueSoon++;
  }
  return { checked, dueSoon, overdue, byBand };
}
