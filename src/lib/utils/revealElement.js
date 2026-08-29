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
 * @param {object} [opts]
 * @param {ScrollBehavior} [opts.behavior]
 * @param {ScrollLogicalPosition} [opts.block]
 * @param {number|null} [opts.offset]
 *   Pixels of fixed furniture at the top of the WINDOW to stay clear of. Given
 *   one, the window is scrolled by hand instead of using scrollIntoView, which
 *   knows nothing about a sticky header and cheerfully parks the target
 *   underneath it. Leave it out where the target sits in its own scrolling box
 *   (Dossier), where scrollIntoView plus scroll-margin-top is the better tool.
 * @returns {boolean} whether there was anything to reveal
 */
export function revealElement(
  el, { behavior = 'smooth', block = 'start', offset = null } = {},
) {
  if (!(el instanceof HTMLElement)) return false;

  if (offset === null) {
    el.scrollIntoView({ behavior, block });
  } else {
    const top = window.scrollY + el.getBoundingClientRect().top - offset;
    window.scrollTo({ top: Math.max(0, top), behavior });
  }
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

/**
 * How far down the window the first unobscured pixel is.
 *
 * The app shell's nav is fixed, and an app may put a sticky bar of its own
 * beneath it. Measured rather than assumed, because both change with the
 * viewport — the Management toolbar is one row wide and two rows narrow, and a
 * hard-coded figure is right at one width and wrong at the other.
 *
 * @param {ParentNode} [scope] where to look for the app's own sticky bar
 * @param {number} [gap] breathing room above the target
 */
export function stickyOffset(scope, gap = 8) {
  if (typeof document === 'undefined') return 0;

  const nav = document.querySelector('nav.sticky, nav.fixed');
  const navH = nav ? nav.getBoundingClientRect().height : 64;

  // Falling back to the document rather than to a guessed height: the app's
  // sticky bar is findable either way, and a number invented here would be
  // right for one app at one width.
  const bar = (scope ?? document).querySelector?.('.sticky:not(nav)');
  const barH = bar ? bar.getBoundingClientRect().height : 0;

  return navH + barH + gap;
}

/**
 * The nearest ancestor that actually scrolls, or null when the window does.
 *
 * "Actually" is the operative word: an element is only a scroller if it both
 * declares overflow and has something to scroll. A box with `overflow: hidden`
 * and content that fits is not one, and treating it as one is how a scroll
 * gets swallowed — the code scrolls a container that cannot move and stops
 * looking, so the window never scrolls at all.
 *
 * @param {Element|null} el
 * @returns {HTMLElement|null}
 */
export function scrollParent(el) {
  let node = el?.parentElement ?? null;

  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    const scrolls = overflowY === 'auto' || overflowY === 'scroll';
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return null;
}
