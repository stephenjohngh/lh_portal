// src/lib/utils/floorSorting.js
// Shared floor sorting utilities for Plans and Walk apps

export const FLOOR_ORDER = {
  'L': 0, 
  'U': 1, 
  'G': 2,
  '1': 3, 
  '2': 4, 
  '3': 5, 
  '4': 6, 
  '5': 7, 
  '6': 8, 
  '7': 9
};

/**
 * Get numeric sort order for a floor level
 * @param {string} floorLevel - Floor level (L, U, G, 1-9)
 * @returns {number} Sort order (0-9, or 999 for unknown)
 */
export function getFloorOrder(floorLevel) {
  return FLOOR_ORDER[String(floorLevel)] ?? 999;
}

/**
 * Sort plans by floor level only
 * @param {Array} plans - Array of plan objects with floor_level property
 * @returns {Array} Sorted copy of plans
 */
export function sortByFloor(plans) {
  return [...plans].sort((a, b) => 
    getFloorOrder(a.floor_level) - getFloorOrder(b.floor_level)
  );
}

/**
 * Sort plans by building name, then floor level
 * @param {Array} plans - Array of plan objects
 * @returns {Array} Sorted copy of plans
 */
export function sortByBuildingAndFloor(plans) {
  return [...plans].sort((a, b) => {
    // Primary: building name alphabetically
    const buildingCmp = (a.building ?? '').localeCompare(b.building ?? '');
    if (buildingCmp !== 0) return buildingCmp;
    
    // Secondary: floor level
    return getFloorOrder(a.floor_level) - getFloorOrder(b.floor_level);
  });
}

/**
 * Sort elements by floor, then type, then asset_id
 * Used in Building Overview and element lists
 * @param {Array} elements - Array of elements with floor_level, element_type, asset_id
 * @returns {Array} Sorted copy of elements
 */
export function sortElementsByFloorTypeAsset(elements) {
  return [...elements].sort((a, b) => {
    // Floor first
    const floorA = getFloorOrder(a.floor_level);
    const floorB = getFloorOrder(b.floor_level);
    if (floorA !== floorB) return floorA - floorB;
    
    // Then type
    if (a.element_type !== b.element_type) {
      return a.element_type.localeCompare(b.element_type);
    }
    
    // Then asset_id (numeric-aware)
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });
}
