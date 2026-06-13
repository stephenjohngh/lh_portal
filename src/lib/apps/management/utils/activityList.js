// src/lib/apps/management/utils/activityList.js
// Pure helpers for the activity log's derived list — linked-action map,
// historic filter, and the sort comparator. Extracted from
// ActivityLogSection.svelte so the sort/filter logic can be unit-tested
// (Type-1 in the testing blueprint; see CLAUDE.md "Testing").

/** Map source_activity_id → the action created from that activity. */
export function linkedActionsByActivityId(actions) {
  return Object.fromEntries(
    (actions ?? [])
      .filter(a => a?.source_activity_id)
      .map(a => [a.source_activity_id, a])
  );
}

/** Hide historic activities unless showHistoric is true. */
export function filterActivities(activities, showHistoric) {
  return showHistoric ? activities : activities.filter(a => !a.historic);
}

/**
 * Sort activities for display. Returns a new array (does not mutate).
 *   sequence: sequenced items first (numeric, by dir); unsequenced fall back
 *             to modified-date in the same direction.
 *   updated_at / created_at: by date, updated_at falling back to created_at.
 * @param {Array} activities
 * @param {'updated_at'|'created_at'|'sequence'} sortField
 * @param {'desc'|'asc'} sortDir
 */
export function sortActivities(activities, sortField, sortDir) {
  return [...activities].sort((a, b) => {
    if (sortField === 'sequence') {
      const aHas = a.sequence != null;
      const bHas = b.sequence != null;
      // Sequenced items first; unsequenced fall back to modified-date at the end.
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas) return sortDir === 'desc' ? b.sequence - a.sequence : a.sequence - b.sequence;
      const aDate = new Date(a.updated_at || a.created_at);
      const bDate = new Date(b.updated_at || b.created_at);
      return sortDir === 'desc' ? bDate - aDate : aDate - bDate;
    }
    const aVal = new Date(sortField === 'updated_at' ? (a.updated_at || a.created_at) : a.created_at);
    const bVal = new Date(sortField === 'updated_at' ? (b.updated_at || b.created_at) : b.created_at);
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });
}
