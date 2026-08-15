// src/lib/apps/dossier/utils/revealBlock.js
// Scroll to a block and mark it briefly.
//
// Separate from pageNav.js, which is pure and says so. This one touches the
// DOM, so it lives on its own rather than putting a `document` reference inside
// a module the server-side archive builder imports.
//
// Used by BOTH surfaces. The author's editor and the recipient's reader render
// different DOM, but every addressable block carries `data-uid` in each of them
// — the editor because the BlockId extension writes it, the reader because the
// same renderHTML runs and the sanitiser keeps data attributes. So one selector
// works for both, which is the only reason this is shared code and not two
// near-identical handlers.

/** Matches the animation in the reader's <style> block. */
const MARK_CLASS = 'pack-reveal';
const MARK_MS = 2400;

/**
 * @param {string|null|undefined} uid
 * @param {{ root?: ParentNode, behavior?: ScrollBehavior }} [opts]
 * @returns {boolean} whether the block was found
 */
export function revealBlock(uid, { root, behavior = 'smooth' } = {}) {
  if (!uid || typeof document === 'undefined') return false;

  const scope = root ?? document;
  // CSS.escape because a uid is a uuid today but the selector should not be
  // the thing that breaks if that ever changes.
  const el = scope.querySelector(`[data-uid="${CSS.escape(String(uid))}"]`);
  if (!(el instanceof HTMLElement)) return false;

  el.scrollIntoView({ behavior, block: 'start' });
  el.classList.add(MARK_CLASS);
  // Removed rather than left on: a highlight that stays reads as part of the
  // document, and what the document says is the author's to decide, not ours.
  setTimeout(() => el.classList.remove(MARK_CLASS), MARK_MS);
  return true;
}
