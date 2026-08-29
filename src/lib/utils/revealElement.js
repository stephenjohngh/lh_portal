// src/lib/utils/revealElement.js
// Scroll something into view and mark it briefly, so a reader can see WHICH
// thing they were sent to.
//
// Extracted from Dossier's revealBlock.js when the Management search needed the
// same behaviour: landing on a page and landing on the right activity are the
// same act, and "you are here" should look identical wherever it happens.
//
// DOM-touching by nature, so it stays out of the pure modules that the server
// and the tests import.

/** The class in app.css that draws the mark. */
export const REVEAL_CLASS = 'lh-reveal';

/**
 * How long the mark stays on.
 *
 * Must match the animation in app.css, or the class is pulled while the mark
 * is still showing and it vanishes mid-fade — which looks like a glitch rather
 * than an ending.
 */
const MARK_MS = 4000;

/**
 * @param {Element|null|undefined} el
 * @param {{ behavior?: ScrollBehavior, block?: ScrollLogicalPosition }} [opts]
 * @returns {boolean} whether there was anything to reveal
 */
export function revealElement(el, { behavior = 'smooth', block = 'start' } = {}) {
  if (!(el instanceof HTMLElement)) return false;

  el.scrollIntoView({ behavior, block });
  el.classList.add(REVEAL_CLASS);
  // Removed rather than left on. A highlight that stays reads as a property of
  // the thing rather than as an answer to what was just asked.
  setTimeout(() => el.classList.remove(REVEAL_CLASS), MARK_MS);
  return true;
}

/**
 * Reveal by id, once the DOM has caught up.
 *
 * The usual caller has just opened a section to make the target exist, so the
 * element is not there yet when the click handler runs. A frame is the honest
 * wait: `tick()` alone returns before the browser has laid the new content out,
 * and a scroll computed against a stale layout lands somewhere arbitrary.
 *
 * @param {string} id
 * @param {{ behavior?: ScrollBehavior, block?: ScrollLogicalPosition }} [opts]
 */
export function revealById(id, opts) {
  if (!id || typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    revealElement(document.getElementById(id), opts);
  });
}
