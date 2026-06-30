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

// -- Sort by system presentation_order → inspection_sort_order → asset_id ------
// The canonical report ROW order — matches the online Components inventory table
// (ComponentInventoryTable): system presentation_order, then the manual
// inspection_sort_order (nulls last), then numeric asset_id. Floor is handled by
// grouping, so it is not a key here. For pre-resolved components carrying
// system_order (number) + inspection_sort_order (number|null) + asset_id.
export function sortBySystemInspectionAsset(a, b) {
  const so = (a.system_order ?? 9999) - (b.system_order ?? 9999);
  if (so !== 0) return so;

  // inspection_sort_order, nulls last
  const iA = a.inspection_sort_order ?? null;
  const iB = b.inspection_sort_order ?? null;
  if (iA !== null && iB !== null && iA !== iB) return iA - iB;
  if (iA !== null && iB === null) return -1;
  if (iA === null && iB !== null) return 1;

  return (a.asset_id ?? '').localeCompare(b.asset_id ?? '', undefined, { numeric: true });
}
