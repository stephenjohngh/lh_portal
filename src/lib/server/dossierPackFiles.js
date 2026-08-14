// src/lib/server/dossierPackFiles.js
// Copying one pack's shelf onto another pack.
//
// Lives here rather than in the route because a SvelteKit endpoint may export
// only HTTP verbs — an extra export passes `npm run check` and fails
// `npm run build` — and because the bounds below are worth reading on their own.

import { listDocuments, copyDocument } from './documentLibrary.js';
import { friendlyStorageError }        from './storage/storageErrors.js';
import { getLogger }                   from '$lib/utils/logger';

const logger = getLogger('DossierPackFiles');

/**
 * Bounds. Every file crosses the function twice — down from storage and back up
 * — so these are tighter than the publish-time equivalents in
 * publicationAssets.js. A pack whose shelf exceeds them still duplicates; the
 * files past the bound are reported to the author rather than passed over, and
 * the references to them come out empty rather than pointing at the original.
 */
export const MAX_COPY_FILES = 25;
export const MAX_COPY_BYTES = 60 * 1024 * 1024;

/** Where a pack's shelf lives, matching what PackWorkspace uploads into. */
const SHELF_FOLDER = 'Dossier Packs';

/**
 * Give `targetPackId` its own copy of every file on `sourcePackId`'s shelf.
 *
 * Never throws for one bad file: a duplicate with a known gap, shown to the
 * author, beats a duplicate that will not complete. The caller uses `map` to
 * rewrite the references in the copied pages, and anything absent from it is
 * emptied there (see utils/packCopy.js).
 *
 * @param {string} sourcePackId
 * @param {string} targetPackId
 * @param {string} userId
 * @returns {Promise<{ map: Record<string, { id: string, provider_file_id: string }>,
 *                     copied: number,
 *                     skipped: { filename: string, reason: string }[] }>}
 */
export async function copyPackFiles(sourcePackId, targetPackId, userId) {
  const files = await listDocuments({
    entity_type: 'dossier_pack', entity_id: sourcePackId,
  });

  /** @type {Record<string, { id: string, provider_file_id: string }>} */
  const map = {};
  /** @type {{ filename: string, reason: string }[]} */
  const skipped = [];
  let budget = MAX_COPY_BYTES;

  for (const file of files.slice(0, MAX_COPY_FILES)) {
    const size = Number(file.file_size) || 0;
    if (size > budget) {
      skipped.push({ filename: file.display_name ?? file.filename ?? 'a file',
        reason: 'the copy would have been too large' });
      continue;
    }

    try {
      const copy = await copyDocument(file.id, {
        entity_type:  'dossier_pack',
        entity_id:    targetPackId,
        folder_path:  SHELF_FOLDER,
        display_name: file.display_name ?? file.filename,
        title:        file.title       ?? null,
        description:  file.description ?? null,
        category:     file.category    ?? null,
        tags:         file.tags        ?? [],
      }, userId);

      map[file.id] = { id: copy.id, provider_file_id: copy.provider_file_id };
      budget -= size;
    } catch (err) {
      // The pages referencing it will show a gap, which is the honest result.
      logger('⚠ could not copy', file.id, '—', friendlyStorageError(err));
      skipped.push({ filename: file.display_name ?? file.filename ?? 'a file',
        reason: 'it could not be read from storage' });
    }
  }

  for (const file of files.slice(MAX_COPY_FILES)) {
    skipped.push({ filename: file.display_name ?? file.filename ?? 'a file',
      reason: `only the first ${MAX_COPY_FILES} files are copied` });
  }

  return { map, copied: Object.keys(map).length, skipped };
}
