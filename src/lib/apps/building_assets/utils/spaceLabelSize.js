// src/lib/apps/building_assets/utils/spaceLabelSize.js
// How big a space's label is drawn on a schematic (migration 242, user
// 2026-10-11): the size it has always been, one point smaller, or two.
// A step is 1px on screen, which is what the label sizes are measured in.
//
// Pure: imports nothing, so the desktop schematic and the phone viewer (which
// starts from its own, smaller base size) share one rule.

/** The choices, in order, as stored in spaces.label_size. */
export const SPACE_LABEL_SIZES = Object.freeze([
  { value: 'normal',  label: 'Normal',          step: 0 },
  { value: 'small',   label: '1 pt smaller',    step: 1 },
  { value: 'smaller', label: '2 pt smaller',    step: 2 },
]);

/** The label's font size in px, from the place's own base size. Unknown → normal. */
export function spaceLabelPx(labelSize, basePx) {
  const step = SPACE_LABEL_SIZES.find(s => s.value === labelSize)?.step ?? 0;
  return basePx - step;
}

/** The word for a stored size. */
export function spaceLabelSizeName(labelSize) {
  return SPACE_LABEL_SIZES.find(s => s.value === labelSize)?.label ?? 'Normal';
}
