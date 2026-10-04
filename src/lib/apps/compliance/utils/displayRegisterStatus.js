// src/lib/apps/compliance/utils/displayRegisterStatus.js
//
// Pure "needs attention" logic for the display register (BSA s.82, EXT-14.R5-R7).
// No DB, no I/O — Type-1 testable. Deliberately does NOT touch `status`: that
// field is set by whoever physically checks the noticeboard (displayed /
// needs_refresh / damaged / obstructed / removed — R6's exception handling).
// This module only computes whether the register should FLAG an otherwise-
// "displayed" item — the refresh task R6/A3 asks for, without a task engine:
// a linked GT document that changed since the last refresh, or a review date
// that's due/overdue. Mirrors golden_thread/utils/gtReview.js's banding.

/** @typedef {'document_updated'|'review_overdue'|'review_due'|null} AttentionReason */

// Day arithmetic has one owner (dates.js, 2026-10-02); re-exported so this
// module's callers keep their import.
import { dueSoonDays } from '../../../utils/dueWindows.js';
import { daysBetween } from '#lib/utils/dates.js';
export { daysBetween };

/**
 * Why (if at all) a displayed item needs attention right now. Only evaluated
 * for items whose manually-set status is 'displayed' — an item already
 * flagged needs_refresh/damaged/obstructed/removed doesn't need a computed
 * reason, the admin already knows.
 *
 * @param {{ status: string, review_date?: string|null, last_refreshed_at?: string|null }} item
 * @param {{ todayISO: string, linkedDocUpdatedAt?: string|null }} ctx
 * @returns {AttentionReason}
 */
export function attentionReason(item, { todayISO, linkedDocUpdatedAt = null }) {
  if (item.status !== 'displayed') return null;

  if (linkedDocUpdatedAt) {
    if (!item.last_refreshed_at) return 'document_updated';
    if (Date.parse(linkedDocUpdatedAt) > Date.parse(item.last_refreshed_at)) return 'document_updated';
  }

  if (item.review_date) {
    const days = daysBetween(todayISO, item.review_date);
    if (days < 0) return 'review_overdue';
    if (days <= dueSoonDays('displayItemReview')) return 'review_due';
  }

  return null;
}

/** Human label for a reason, for the register row / badge. */
export function attentionLabel(reason) {
  switch (reason) {
    case 'document_updated': return 'Document updated — refresh needed';
    case 'review_overdue':   return 'Review overdue';
    case 'review_due':       return 'Review due soon';
    default:                 return null;
  }
}
