// src/lib/server/dossierImportDocuments.js
// Copying documents that belong to ANOTHER record (an issue's attachments) onto a
// pack's shelf, for a pack built from a plan (utils/packPlan.js).
//
// Lives here, not in the route, because a SvelteKit endpoint may export only HTTP
// verbs. Bounds are the same as copying a pack's shelf: every file crosses the
// function twice, so a request is small and the caller batches.

import { copyDocument, getDocument } from './documentLibrary.js';
import { canAccessDocument } from './documentAccess.js';
import { friendlyStorageError } from './storage/storageErrors.js';
import { getLogger } from '#lib/utils/logger.js';

const logger = getLogger('DossierImportDocuments');

export const MAX_IMPORT_FILES = 25;
export const MAX_IMPORT_BYTES = 60 * 1024 * 1024;

/**
 * @param {string} targetPackId
 * @param {{ documentId: string, folderPath?: string, description?: string|null }[]} items
 * @param {string} userId
 * @param {{ isAdmin: boolean, token: string }} caller
 * @returns {Promise<{ map: Record<string, object>, skipped: { documentId: string, filename: string, reason: string }[] }>}
 */
export async function importDocumentsIntoPack(targetPackId, items, userId, caller) {
  /** @type {Record<string, object>} */
  const map = {};
  const skipped = [];
  let budget = MAX_IMPORT_BYTES;

  for (const item of items.slice(0, MAX_IMPORT_FILES)) {
    let src;
    try { src = await getDocument(item.documentId); }
    catch { skipped.push({ documentId: item.documentId, filename: 'a file', reason: 'it no longer exists' }); continue; }
    const name = src.display_name ?? src.filename ?? 'a file';

    // The caller must be allowed to read the document where it lives.
    const allowed = await canAccessDocument(src, caller);
    if (!allowed.ok) { skipped.push({ documentId: item.documentId, filename: name, reason: 'you may not read it' }); continue; }

    const size = Number(src.file_size) || 0;
    if (size > budget) { skipped.push({ documentId: item.documentId, filename: name, reason: 'the copy would have been too large' }); continue; }

    try {
      const copy = await copyDocument(item.documentId, {
        entity_type:  'dossier_pack',
        entity_id:    targetPackId,
        folder_path:  item.folderPath || undefined,
        display_name: name,
        description:  item.description ?? src.description ?? null,
        title:        src.title ?? null,
      }, userId);
      map[item.documentId] = copy;
      budget -= size;
    } catch (err) {
      logger('⚠ could not import', item.documentId, '—', friendlyStorageError(err));
      skipped.push({ documentId: item.documentId, filename: name, reason: 'it could not be read from storage' });
    }
  }
  for (const item of items.slice(MAX_IMPORT_FILES)) {
    skipped.push({ documentId: item.documentId, filename: 'a file', reason: `only ${MAX_IMPORT_FILES} files are copied at a time` });
  }
  return { map, skipped };
}
