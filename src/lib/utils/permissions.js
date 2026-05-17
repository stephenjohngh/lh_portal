// src/lib/utils/permissions.js
// Client-side permission helpers that go beyond the standard
// admin/edit/read-only split — chiefly for record-ownership grace periods.
//
// These helpers are used to decide whether to *show* a UI control. The DB
// is the authority — RLS policies in supabase/migrations/ enforce the same
// rules server-side. If you change one side, change the other (see e.g.
// migration 124_grace_period_deletes.sql).

/**
 * Can the current user delete this record under the "admin or owner within
 * grace window" rule? Used for activity and action delete buttons in the
 * Management app, where the original creator may correct mistakes for a
 * short window after creation.
 *
 * Mirrors the RLS policy in migration 124:
 *   admin OR (created_by = auth.uid() AND created_at > now() - 2h)
 *
 * @param {{ created_by: string|null, created_at: string|null } | null} record
 * @param {string|null|undefined} userId
 * @param {boolean} isAdmin
 * @param {number} [graceHours=2]
 * @returns {boolean}
 */
export function canDeleteOwn(record, userId, isAdmin, graceHours = 2) {
  if (isAdmin) return true;
  if (!record || !userId)            return false;
  if (record.created_by !== userId)  return false;
  if (!record.created_at)            return false;
  const ageMs = Date.now() - new Date(record.created_at).getTime();
  return ageMs >= 0 && ageMs < graceHours * 3_600_000;
}
