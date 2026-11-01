// src/lib/apps/dossier/utils/fileSync.js
// Keeping a pack's Drive folders in step with its file tree — the pure half.
//
// The database tree (dossier_folders + placements) is the source of truth. Drive is
// a MIRROR for browsing and backup: a file's Drive folder is derived from its place
// in the tree, and a file keeps working wherever it sits because its row holds the
// provider file id. So a mirror that has fallen behind is untidy, never broken —
// which is why it is brought into step on request and best-effort, not enforced.
//
// "In step" is judged from `document_library.folder_path`, which the server writes
// only AFTER it has moved the file. A mismatch between that and the path the tree
// asks for therefore means "not yet moved", with no call to Drive needed to know.

import { DOC_FOLDERS, entityFolderPath } from '#lib/utils/documentUtils.js';
import { storageSegments, placementMap, descendantFolderIds } from './fileTree.js';

/** Files sent to the server per request — each is a Drive call or three. */
export const SYNC_CHUNK = 20;

/** The pack's own storage folder: `Dossier Packs/<title> (shortid)`. */
export function packStoragePath(pack) {
  return entityFolderPath(DOC_FOLDERS.DOSSIER_PACKS, pack?.title, pack?.id);
}

/** The storage path for a position in the tree (null folder = the pack's own folder). */
export function desiredFolderPath(pack, folders = [], folderId = null) {
  return [packStoragePath(pack), ...(folderId ? storageSegments(folders, folderId) : [])].join('/');
}

/** Where the tree says this file's storage folder should be. */
export function desiredPathFor(pack, file, folders = [], placements = []) {
  return desiredFolderPath(pack, folders, placementMap(placements).get(file.id) ?? null);
}

/** Files whose recorded storage folder is not where the tree puts them. */
export function filesOutOfStep(pack, files = [], folders = [], placements = []) {
  const place = placementMap(placements);
  return files.filter((f) =>
    (f.folder_path ?? '') !== desiredFolderPath(pack, folders, place.get(f.id) ?? null));
}

/** The files in a folder and in every folder beneath it. */
export function filesUnderFolder(folders = [], placements = [], files = [], folderId) {
  const inside = new Set([folderId, ...descendantFolderIds(folders, folderId)]);
  const place = placementMap(placements);
  return files.filter((f) => inside.has(place.get(f.id)));
}

/** Split a list for sending in pieces. */
export function chunk(list = [], size = SYNC_CHUNK) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
