// src/lib/utils/actionSort.js
// Stable sort for the Issues actions list.
//
// Order:
//   1. Status:    in-progress → pending → completed
//   2. Deadline:  earliest first; null deadlines sort to the bottom
//   3. Created:   earliest first (final tiebreaker)
//
// Pure function — non-mutating; returns a new array.

const STATUS_ORDER = {
  'in-progress': 1,
  'pending':     2,
  'completed':   3
};

/**
 * @param {Array} actions
 * @returns {Array}
 */
export function sortActions(actions) {
  if (!Array.isArray(actions)) return [];

  return [...actions].sort((a, b) => {
    // 1. Status priority
    const sa = STATUS_ORDER[a.status] ?? 999;
    const sb = STATUS_ORDER[b.status] ?? 999;
    if (sa !== sb) return sa - sb;

    // 2. Deadline (earliest first; nulls last)
    const hasA = a.date_deadline != null && a.date_deadline !== '';
    const hasB = b.date_deadline != null && b.date_deadline !== '';
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    if (hasA && hasB) {
      const da = new Date(a.date_deadline).setHours(0, 0, 0, 0);
      const db = new Date(b.date_deadline).setHours(0, 0, 0, 0);
      if (!isNaN(da) && !isNaN(db) && da !== db) return da - db;
    }

    // 3. Created (earliest first)
    const ca = new Date(a.created_at).getTime();
    const cb = new Date(b.created_at).getTime();
    if (!isNaN(ca) && !isNaN(cb)) return ca - cb;

    return 0;
  });
}
