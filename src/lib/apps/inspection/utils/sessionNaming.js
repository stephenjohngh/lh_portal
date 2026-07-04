// src/lib/apps/inspection/utils/sessionNaming.js

import { fmtMonthYearCompact } from '$lib/utils/dates';

/**
 * Builds an initials string from a building/facility name.
 * "Lincoln House" → "LH"
 */
export function buildingInitials(name) {
  if (!name) return 'UNK';
  return name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').filter(Boolean).join('');
}

/**
 * Generates a session name.
 * Format: {Short}_{BuildingInitials}_{Floor|Bldg}_{MonthYear}
 * e.g. "FD_LH_Bldg_Apr26", "Custom_LH_F1_Apr26"
 * A definition (configurable inspection) contributes its name's initials,
 * e.g. definition "Fire Doors" → "FD_LH_Bldg_Apr26"; otherwise the walk is
 * the ad-hoc Custom flow. (The retired preset shorts EL/FD/AD live on only
 * in historic session names.)
 */
export function generateSessionName({ preset, definition, building, floor, scope }) {
  const dateStr     = fmtMonthYearCompact();
  const buildingStr = buildingInitials(building);
  const scopeStr    = scope === 'building' ? 'Bldg' : `F${floor?.short_name ?? '?'}`;

  const short = definition
    ? buildingInitials(definition.name)
    : (preset === 'custom' ? 'Custom' : 'Walk');

  return `${short}_${buildingStr}_${scopeStr}_${dateStr}`;
}
