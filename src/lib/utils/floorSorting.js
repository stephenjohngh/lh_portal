// src/lib/utils/floorSorting.js
// Shared floor sorting utilities for Plans and Walk apps.
//
// FLOOR_ORDER is derived from FLOOR_LEVELS in planConstants.js — that array
// is the single source of truth for floor order. Adding a floor there
// automatically updates all sort functions here.

import { FLOOR_LEVELS } from '$lib/utils/planConstants';

/**
 * Numeric sort rank for each floor value, derived from the FLOOR_LEVELS array order.
 * X=0, L=1, U=2, G=3, 1=4 … 7=10, R=11, E=12
 */
export const FLOOR_ORDER = Object.fromEntries(
  FLOOR_LEVELS.map((f, i) => [f.value, i])
);

/**
 * Get numeric sort order for a floor level.
 * @param {string} floorLevel
 * @returns {number} Sort index, or 999 for unknown values.
 */
export function getFloorOrder(floorLevel) {
  return FLOOR_ORDER[String(floorLevel)] ?? 999;
}

/**
 * Sort plans by floor level only.
 */
export function sortByFloor(plans) {
  return [...plans].sort((a, b) =>
    getFloorOrder(a.floor_level) - getFloorOrder(b.floor_level)
  );
}

/**
 * Sort plans by building name, then floor level.
 */
export function sortByBuildingAndFloor(plans) {
  return [...plans].sort((a, b) => {
    const buildingCmp = (a.building ?? '').localeCompare(b.building ?? '');
    if (buildingCmp !== 0) return buildingCmp;
    return getFloorOrder(a.floor_level) - getFloorOrder(b.floor_level);
  });
}

/**
 * Sort elements by floor, then type, then asset_id.
 */
export function sortElementsByFloorTypeAsset(elements) {
  return [...elements].sort((a, b) => {
    const floorDiff = getFloorOrder(a.floor_level) - getFloorOrder(b.floor_level);
    if (floorDiff !== 0) return floorDiff;
    if (a.element_type !== b.element_type) return a.element_type.localeCompare(b.element_type);
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });
}
