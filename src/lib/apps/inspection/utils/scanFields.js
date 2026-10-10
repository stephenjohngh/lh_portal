// src/lib/apps/inspection/utils/scanFields.js
//
// The camera reader in the Inspection app (2026-10-10): which kind of number a
// field is, and what the Jump list can be scanned against. Pure.
//
// Scanned: readings (a gauge or display), the asset id and text/number
// attributes (labels, serial numbers), and the Jump list (the number on a
// door or tag, to find that component). ⛔ Not notes or names — prose is
// better dictated with the phone's keyboard than read off a picture.

import { normaliseScan } from '#lib/utils/textScan/scanMatch.js';
import { buildComponentRef } from '#lib/utils/componentRef.js';

export const INSPECTION_ACCENT = 'var(--lh-inspection-accent, #fb923c)';

/**
 * The scan profile for an attribute or reading field, or null where scanning
 * makes no sense (a checkbox, a choice, free prose).
 * @param {string|null|undefined} displayType
 */
export function scanProfileFor(displayType) {
  if (displayType === 'number') return 'reading';
  if (displayType === 'text' || displayType == null || displayType === '') return 'code';
  return null;
}

/**
 * What a scan in the Jump list can match: each component's asset id and its
 * label (a door number is usually one or the other), shown with its ref.
 * @param {any[]} components  the walk, in walk order
 * @param {any[]} floors @param {any[]} types
 * @returns {Array<{ value: string, label: string, id: string, index: number }>}
 */
export function jumpCandidates(components, floors, types) {
  const out = [];
  components.forEach((c, index) => {
    const ref = buildComponentRef(c, floors, types);
    for (const v of [c.asset_id, c.label]) {
      if (v && normaliseScan(v, 'code')) out.push({ value: String(v), label: ref, id: c.id, index });
    }
  });
  return out;
}

/**
 * The walk index for a value picked as read (no candidate chosen): the
 * component whose asset id or label is exactly that, or null.
 * @param {string} value
 * @param {ReturnType<typeof jumpCandidates>} candidates
 */
export function jumpIndexFor(value, candidates) {
  const key = normaliseScan(value, 'code');
  const hit = candidates.find((c) => normaliseScan(c.value, 'code') === key);
  return hit ? hit.index : null;
}
