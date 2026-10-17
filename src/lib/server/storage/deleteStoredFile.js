// src/lib/server/storage/deleteStoredFile.js
// Delete one stored file from the provider that OWNS it — the declared
// provider, else the one its URL shape names (storageRef.js) — never simply
// the active one. A file already gone (a real 404) counts as deleted: that is
// the outcome wanted. ⛔ No permission check here: the caller decides who may
// (DELETE /api/media/file checks the person; Parking retention is an admin
// run). Shared by both so the provider rule and the "already gone" rule are
// written once (2026-10-17).

import { providerByName }       from './index.js';
import { resolveStorageRef }    from './storageRef.js';
import { friendlyStorageError } from './storageErrors.js';

/**
 * @param {string|null} url
 * @param {string|null} [declaredProvider]
 * @param {{ wantParent?: boolean }} [opts]  also return the folder it was in (for tidying)
 * @returns {Promise<{ ok: boolean, error?: string, parent?: any, impl?: any }>}
 */
export async function deleteStoredFile(url, declaredProvider = null, { wantParent = false } = {}) {
  const { provider, ref, bucket, reason } = resolveStorageRef(url, declaredProvider);
  if (!ref) return { ok: false, error: reason };
  const impl = providerByName(provider);
  if (!impl) return { ok: false, error: `No provider implementation for "${provider}".` };

  // Asked before the delete: afterwards the file cannot say where it was.
  let parent = null;
  if (wantParent && typeof impl.parentFolderOf === 'function') {
    try { parent = await impl.parentFolderOf(ref); } catch { /* tidying is optional */ }
  }
  try {
    await impl.deleteFile(ref, bucket ? { bucket } : undefined);
    return { ok: true, parent, impl };
  } catch (/** @type {any} */ err) {
    const msg = friendlyStorageError(err);
    const gone = err?.code === 404 || err?.status === 404 || /not found/i.test(msg);
    return gone ? { ok: true, impl } : { ok: false, error: msg };
  }
}
