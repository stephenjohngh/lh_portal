// src/lib/apps/building_assets/utils/spaceTypeOptions.js
// Which TYPES a space of a given KIND may take (migration 220).
//
// A Space takes a room type (Plant Room, Stairwell, Car Park …); a Parking bay
// (kind 'slot') takes a bay size. The bay size is what a parking tariff is
// priced on, so a bay must never be offered "Stairwell" — which is what
// happened while one list served both kinds.
//
// Pure: takes the space_types rows, returns values. A row with no `kind` is a
// Space type — that is every row before migration 220, so the app keeps
// working until it is applied. If nothing is configured for a kind, the
// shipped defaults are offered, the same fallback the Space list already had.

import { SPACE_TYPES } from '../components/plan/planMeasure.js';

/** The bay sizes a Parking bay may be, largest first. */
export const PARKING_BAY_TYPES = ['Large car', 'Car', 'Motorcycle', 'Bicycle'];

/** The kind a space_types row belongs to. */
export function typeKind(row) {
  return row?.kind === 'slot' ? 'slot' : 'space';
}

/**
 * Type values offered for one kind, in the rows' order.
 * @param {Array<{value:string, kind?:string}>} rows  space_types rows
 * @param {'space'|'slot'} kind
 * @returns {string[]}
 */
export function typesForKind(rows, kind) {
  const want = kind === 'slot' ? 'slot' : 'space';
  const values = (rows ?? []).filter(r => typeKind(r) === want).map(r => r.value);
  if (values.length) return values;
  return want === 'slot' ? PARKING_BAY_TYPES : SPACE_TYPES;
}
