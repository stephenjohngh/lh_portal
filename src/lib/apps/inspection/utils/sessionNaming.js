// src/lib/apps/inspection/utils/sessionNaming.js

import { presetLabel } from './inspectionHelpers.js';
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
 * Format: {PresetShort}_{BuildingInitials}_{Floor|Bldg}_{MonthYear}
 * e.g. "EL_LH_Bldg_Apr26", "FD_LH_FG_Apr26", "Custom_LH_F1_Apr26"
 */
export function generateSessionName({ preset, building, floor, scope }) {
  const dateStr     = fmtMonthYearCompact();
  const buildingStr = buildingInitials(building);
  const scopeStr    = scope === 'building' ? 'Bldg' : `F${floor?.short_name ?? '?'}`;

  const presetShort = {
    custom:             'Custom',
    emergency_lighting: 'EL',
    fire_doors:         'FD',
    apartment_doors:    'AD',
  }[preset] ?? 'Walk';

  return `${presetShort}_${buildingStr}_${scopeStr}_${dateStr}`;
}
