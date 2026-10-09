// parking/utils/revealOnNarrow.js
// A Svelte action: on a narrow screen (below Tailwind's lg, where the panel
// sits under the list rather than beside it), scroll the element into view
// when it appears and whenever `key` changes. Without it, tapping a bay or an
// agreement on a phone opens its panel off-screen and looks like nothing
// happened. On a wide screen the panel is already beside the list, so nothing moves.

/** @param {HTMLElement} node @param {unknown} key */
export function revealOnNarrow(node, key) {
  const reveal = () => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(max-width: 1023px)').matches) return;
    requestAnimationFrame(() => node.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  };
  reveal();
  return {
    /** @param {unknown} next */
    update(next) { if (next !== key) { key = next; reveal(); } },
  };
}
