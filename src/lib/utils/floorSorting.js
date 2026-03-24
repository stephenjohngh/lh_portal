// src/lib/utils/floorSorting.js
// Shared floor sorting utilities for Plans and Walk apps.
// FLOOR_ORDER is derived from FLOOR_LEVELS in planConstants.js — that array
// is the single source of truth for floor order.

import { FLOOR_LEVELS } from '$lib/utils/planConstants';

export const FLOOR_ORDER = Object.fromEntries(
  FLOOR_LEVELS.map((f, i) => [f.value, i])
);

export function getFloorOrder(floorLevel) {
  return FLOOR_ORDER[String(floorLevel)] ?? 999;
}

export function sortByFloor(plans) {
  return [...plans].sort((a, b) =>
    getFloorOrder(a.floor_level) - getFloorOrder(b.floor_level)
  );
}

export function sortByBuildingAndFloor(plans) {
  return [...plans].sort((a, b) => {
    const buildingCmp = (a.building ?? '').localeCompare(b.building ?? '');
    if (buildingCmp !== 0) return buildingCmp;
    return getFloorOrder(a.floor_level) - getFloorOrder(b.floor_level);
  });
}

export function sortElementsByFloorTypeAsset(elements) {
  return [...elements].sort((a, b) => {
    const floorDiff = getFloorOrder(a.floor_level) - getFloorOrder(b.floor_level);
    if (floorDiff !== 0) return floorDiff;
    if (a.element_type !== b.element_type) return a.element_type.localeCompare(b.element_type);
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });
}
