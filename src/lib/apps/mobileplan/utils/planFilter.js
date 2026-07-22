// src/lib/apps/mobileplan/utils/planFilter.js
//
// Pure filtering + display helpers shared by the plan (MarkerOverlay), the
// FilterSheet and the component table, so the "what's hidden" rule and the
// system-level toggle live in exactly one place.
//
// The underlying filter state is `hiddenTypes` (a Set of type CODES) +
// `hiddenStatuses` (a Set of status strings). Filtering is presented to the user
// at SYSTEM granularity — a system's checkbox toggles all of its types — so these
// helpers translate between the two.

/** The four component statuses, in display order. */
export const STATUSES = ['ok', 'problem', 'failed', 'inactive'];

/** Short pill labels for the status filter chips. */
export const STATUS_LABELS = {
  ok:       '✓ OK',
  problem:  '⚙ Problem',
  failed:   '✗ Failed',
  inactive: '— Inactive',
};

/** Longer labels for a table's status cell. */
export function resultLabel(status) {
  switch (status) {
    case 'ok':        return '✓ OK';
    case 'failed':    return '✗ Failed';
    case 'problem':   return '⚙ Problem';
    case 'inactive':  return '— Inactive';
    case 'no_access': return '⊘ No access';
    default:          return status ?? '—';
  }
}

/** CSS class for a status cell (ok/failed/problem/inactive). */
export function resultClass(status) {
  switch (status) {
    case 'ok':        return 'ok';
    case 'failed':    return 'failed';
    case 'problem':   return 'problem';
    case 'inactive':  return 'inactive';
    case 'no_access': return 'inactive';
    default:          return '';
  }
}

/** Types belonging to a building system. */
export function typesForSystem(types, systemId) {
  return types.filter(t => t.building_system_id === systemId);
}

/**
 * Tri-state of a system's checkbox given the hidden-types set:
 * 'all' (nothing hidden), 'none' (all hidden), 'some' (mixed), or 'all' when the
 * system has no types.
 */
export function systemState(types, systemId, hiddenTypes) {
  const sysTypes = typesForSystem(types, systemId);
  if (sysTypes.length === 0) return 'all';
  const hidden = sysTypes.filter(t => hiddenTypes.has(t.code)).length;
  if (hidden === 0)                 return 'all';
  if (hidden === sysTypes.length)   return 'none';
  return 'some';
}

/**
 * Toggle a whole system in a hidden-types set, returning a NEW Set. If the system
 * is fully visible it becomes hidden; otherwise (none or some hidden) it becomes
 * fully visible.
 */
export function toggleSystem(types, systemId, hiddenTypes) {
  const sysTypes = typesForSystem(types, systemId);
  const next = new Set(hiddenTypes);
  if (systemState(types, systemId, hiddenTypes) === 'all') {
    sysTypes.forEach(t => next.add(t.code));
  } else {
    sysTypes.forEach(t => next.delete(t.code));
  }
  return next;
}

/** Toggle a single status in a hidden-statuses set, returning a NEW Set. */
export function toggleStatus(status, hiddenStatuses) {
  const next = new Set(hiddenStatuses);
  if (next.has(status)) next.delete(status); else next.add(status);
  return next;
}

/**
 * Whether a component is filtered out (hidden) by the current filter.
 * The single source of truth for the plan markers and the table.
 */
export function isFiltered(c, hiddenTypes, hiddenStatuses) {
  if (hiddenTypes.has(c.type_code)) return true;
  if (hiddenStatuses.size > 0 && hiddenStatuses.has(c.status)) return true;
  return false;
}

/**
 * Canonical component reference `{floorShort}/{typeInitial}/{assetId}` (e.g.
 * `G/FD/12`) — matches buildComponentRef, but takes the single loaded floor's
 * short name directly (mobileplan loads one floor at a time).
 */
export function componentRef(c, floorShort, type) {
  const fl  = floorShort   ?? '?';
  const ini = type?.initial ?? '?';
  const id  = c.asset_id || '—';
  return `${fl}/${ini}/${id}`;
}
