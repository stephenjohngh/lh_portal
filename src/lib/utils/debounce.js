// src/lib/utils/debounce.js
// Tiny debounce helper for filter inputs and other rapid-fire callbacks.
// The returned function delays calling `fn` until `wait` ms have passed
// since the last invocation. Successive calls reset the timer.
//
// Usage:
//   import { debounce } from '$lib/utils/debounce';
//   const debouncedSearch = debounce(applyFilters, 250);
//   <input on:input={debouncedSearch} />

/**
 * @template {(...args: any[]) => any} F
 * @param {F} fn
 * @param {number} wait  milliseconds to wait
 * @returns {F & { cancel: () => void }}
 */
export function debounce(fn, wait = 250) {
  let timer = null;
  const debounced = /** @type {F} */ ((...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, wait);
  });
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return /** @type {F & { cancel: () => void }} */ (debounced);
}
