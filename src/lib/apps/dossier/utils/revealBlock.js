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

import { revealElement } from '$lib/utils/revealElement.js';

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

  // The scroll and the mark are shared — see $lib/utils/revealElement.js. What
  // is Dossier's is the SELECTOR above: data-uid, written by both surfaces.
  return revealElement(el, { behavior });
}
