// src/lib/apps/compliance/utils/displayRegisterLink.js
//
// The BSA s.82 display duty has TWO homes in this app, and until 2026-09-23
// neither knew about the other: the compliance obligations register carries
// the DUTY (`display_prescribed_information`), and the Display register tab
// records the WALL — what is actually on the notice board. Review round 11's
// finding was that the software had the screen before the register had the
// duty; once both existed, nothing joined them.
//
// ⛔ A LINK, NOT A MERGE, and not a status. The board being correct and the
// monthly check being scheduled are different facts: a perfect board with no
// planned obligation is a duty nobody is prompted to keep, and a switched-on
// planned obligation says nothing about what is on the wall today. So this
// reports on the PLAN only, and the Display register keeps reporting the wall.
//
// Pure: no imports, so it can be tested without a store.

/** The register row that names the s.82 / SI 2023/907 reg 8 display duty. */
export const DISPLAY_DUTY_KEY = 'display_prescribed_information';

/** @param {string|null|undefined} key */
export function isDisplayDuty(key) {
  return key === DISPLAY_DUTY_KEY;
}

/**
 * What THIS building has done about the display duty.
 *
 * @param {Array<{ template_key?: string|null, active?: boolean, retired_on?: string|null }>} definitions
 *   planned obligations (statutory_obligations rows)
 * @returns {{ state: 'none'|'off'|'on', planned: any[] }}
 *   `none` — nothing applies the duty here · `off` — applied but switched off
 *   · `on` — at least one live planned obligation prompts the check
 */
export function displayDutyPlan(definitions) {
  const planned = (definitions ?? []).filter(
    (d) => d?.template_key === DISPLAY_DUTY_KEY && !d?.retired_on,
  );
  if (planned.length === 0) return { state: 'none', planned };
  return { state: planned.some((d) => d.active) ? 'on' : 'off', planned };
}
