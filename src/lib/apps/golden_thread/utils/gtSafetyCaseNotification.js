// src/lib/apps/golden_thread/utils/gtSafetyCaseNotification.js
//
// Pure helpers for the safety-case revision -> regulator-notification workflow
// (EXT-13.R2). No DB/I-O — Type-1 testable. `notified_at` null = pending; the
// system's job is to make that visible, not to guess whether one is overdue —
// the statute says "as soon as reasonably practicable", not a fixed number of
// days, so no SLA banding is invented here (contrast gtReview.js's review-due
// bands, which mirror a real cycle_days the register sets itself).

import { daysBetween } from './gtReview.js';

/**
 * Pending notifications (not yet told to the regulator), oldest first — the
 * ones that have waited longest surface first.
 * @param {Array<{ notified_at?: string|null, created_at: string }>} notifications
 */
export function pendingNotifications(notifications) {
  return notifications
    .filter((n) => !n.notified_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Whole days a notification has been pending, as at todayISO.
 * @param {{ created_at: string }} notification
 * @param {string} todayISO
 */
export function daysPending(notification, todayISO) {
  return daysBetween(notification.created_at.slice(0, 10), todayISO);
}
