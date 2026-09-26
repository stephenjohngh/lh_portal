// src/lib/server/pinnedCopies.js
// Remove a publication's pinned copies, each from the provider it was pinned
// to.
//
// ⛔ THE FAULT THIS REPLACES. Deleting a publication used to call
// `DELETE /api/media/file/<id>` once per pinned copy. That route was moved to
// `DELETE /api/media/file` (batch, by URL) on 2026-09-21, leaving the per-id
// path GET-only — so every call was refused, `Promise.allSettled` swallowed
// the refusal, and the publication row was deleted anyway. The copies stayed
// in storage with nothing left naming them. No publication had been deleted
// since, so nothing was lost; the next one would have been.
//
// A pinned copy is written to whichever provider is configured at publish
// time, and the manifest records which (`pinned_provider`). One written before
// that was recorded carries none, and falls back to the configured provider —
// the only information there is.

import { ownerOf } from './storage/index.js';
import { isStorageId } from './storage/storageRef.js';

/**
 * @param {object} manifest   the publication's manifest
 * @param {{ ownerOf?: typeof ownerOf }} [deps]  injectable for tests
 * @returns {Promise<{ removed: number, failed: { id: string, error: string }[] }>}
 */
export async function removePinnedCopies(manifest, deps = {}) {
  const resolve = deps.ownerOf ?? ownerOf;
  const pins = (manifest?.files ?? []).filter(f => f?.pinned_file_id);
  let removed = 0;
  const failed = [];
  for (const f of pins) {
    const id = String(f.pinned_file_id);
    const provider = f.pinned_provider ?? null;
    try {
      if (!isStorageId(id, provider)) throw new Error('Not a well-formed storage id.');
      await resolve(provider).deleteFile(id);
      removed += 1;
    } catch (/** @type {any} */ err) {
      failed.push({ id, error: String(err?.message ?? err) });
    }
  }
  return { removed, failed };
}
