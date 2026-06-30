// src/lib/utils/componentSorting.js
// Component sort helpers shared across inspection, building assets and report generation.
// All functions are pure (no store or DOM access).

// -- Sort by result severity ---------------------------------------------------
// failed (0) → problem (1) → ok (2) → inactive (3)
const RANK = { failed: 0, problem: 1, ok: 2, inactive: 3 };

export function resultRankSort(resultA, resultB) {
  return (RANK[resultA] ?? 4) - (RANK[resultB] ?? 4);
}

// -- Sort by floor → asset_id --------------------------------------------------
// a, b must have: floor_order (number) and asset_id (string | null)
export function sortByFloorAsset(a, b) {
  const fo = (a.floor_order ?? 9999) - (b.floor_order ?? 9999);
  if (fo !== 0) return fo;
  return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
}

// -- Sort by result → floor → asset_id ----------------------------------------
// Puts worst results first. a, b must have: result, floor_order, asset_id.
export function sortByResultFloorAsset(a, b) {
  const byResult = resultRankSort(a.result ?? a.status, b.result ?? b.status);
  if (byResult !== 0) return byResult;
  return sortByFloorAsset(a, b);
}

// -- Sort by system → type → asset_id -----------------------------------------
// For pre-resolved components (server-side or payload) where system_name and
// type_name are already strings (not IDs).
export function sortBySystemTypeAsset(a, b) {
  return (a.system_name ?? '').localeCompare(b.system_name ?? '') ||
         (a.type_name   ?? '').localeCompare(b.type_name   ?? '') ||
         (a.asset_id    ?? '').localeCompare(b.asset_id    ?? '', undefined, { numeric: true, sensitivity: 'base' });
}

// -- Sort by system presentation_order → type presentation_order → asset_id ----
// The canonical report order — matches the Components-tab filters (which use the
// store's presentation_order, NOT alphabetical names). For pre-resolved
// components carrying system_order / type_order (numbers); missing orders sort
// last, then fall back to the system/type name.
export function sortBySystemTypeOrderAsset(a, b) {
  return ((a.system_order ?? 9999) - (b.system_order ?? 9999)) ||
         ((a.type_order   ?? 9999) - (b.type_order   ?? 9999)) ||
         (a.system_name ?? '').localeCompare(b.system_name ?? '') ||
         (a.type_name   ?? '').localeCompare(b.type_name   ?? '') ||
         (a.asset_id    ?? '').localeCompare(b.asset_id    ?? '', undefined, { numeric: true, sensitivity: 'base' });
}
