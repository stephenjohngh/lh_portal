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
import { folderKey } from './storage/folderNames.js';

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
  /** @type {Map<string, any>} folder id → its provider */
  const folders = new Map();
  for (const f of pins) {
    const id = String(f.pinned_file_id);
    const provider = f.pinned_provider ?? null;
    try {
      if (!isStorageId(id, provider)) throw new Error('Not a well-formed storage id.');
      const store = resolve(provider);
      // Asked before the delete: afterwards the file is gone and cannot say.
      const parent = await store.parentFolderOf?.(id).catch(() => null);
      await store.deleteFile(id);
      removed += 1;
      if (parent) folders.set(parent, store);
    } catch (/** @type {any} */ err) {
      failed.push({ id, error: String(err?.message ?? err) });
    }
  }
  for (const [folderId, store] of folders) await tidyPinFolders(store, folderId);
  return { removed, failed };
}

/**
 * Bin the publish's folder once it is empty, then the pack's folder above it
 * once that is empty too (pinFolderPath in publicationAssets.js). Only folders
 * of those two shapes — a dated publish folder, a `<title> (1a2b3c4d)` pack
 * folder — so `_published` itself, which held every copy before 2026-11-09, is
 * never touched. Best effort: an untidy folder is not a failed delete.
 * @param {any} store
 * @param {string} folderId
 */
async function tidyPinFolders(store, folderId) {
  if (!store.trashFolderIfEmpty || !store.getFileMetadata) return;
  try {
    const publish = await store.getFileMetadata(folderId);
    if (!PUBLISH_FOLDER.test(publish?.name ?? '')) return;
    const packId = await store.parentFolderOf?.(folderId).catch(() => null);
    if (!(await store.trashFolderIfEmpty(folderId)) || !packId) return;
    const pack = await store.getFileMetadata(packId);
    if (folderKey(pack?.name)) await store.trashFolderIfEmpty(packId);
  } catch { /* left for Compare with Drive to show */ }
}

/** A publish folder's name: `2026-11-09 14.32`. */
const PUBLISH_FOLDER = /^\d{4}-\d{2}-\d{2} \d{2}\.\d{2}$/;
