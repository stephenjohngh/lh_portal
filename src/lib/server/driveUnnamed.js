// src/lib/server/driveUnnamed.js
//
// Files in the portal's Drive folder that nothing in the portal names
// (Admin → Records → Documents → Files nothing names, 2026-11-09).
//
// Check files asks the other question — does each record's file still exist —
// so between them a file left behind in Drive and a record whose file has gone
// are both found. ⛔ This changes nothing: it lists, and a person decides.
//
// What names a Drive file, every place the file proxy and the deletes look:
//   document_library.provider_file_id · media_attachments.storage_url ·
//   maintenance_documents.storage_path · a Dossier publication's pinned copies
//   (manifest.files[].pinned_file_id).
// A record holding a URL is read for any Drive-id-shaped token in it, so a
// view link, a download link and the portal's own proxy address all count.

import { readAllPages } from '#lib/utils/readAllPages.js';

/** Drive ids are long runs of letters, digits, - and _. */
const ID_TOKEN = /[A-Za-z0-9_-]{25,}/g;

/** @param {string|null|undefined} text @returns {string[]} */
export function idsIn(text) {
  return text ? (String(text).match(ID_TOKEN) ?? []) : [];
}

/**
 * Every Drive file id some record names.
 * @param {any} db  a SERVICE-ROLE client
 * @returns {Promise<Set<string>>}
 */
export async function collectNamedIds(db) {
  const [library, media, maintenance, publications] = await Promise.all([
    readAllPages(() => db.from('document_library').select('id, provider_file_id').order('id')),
    readAllPages(() => db.from('media_attachments').select('id, storage_url').order('id')),
    readAllPages(() => db.from('maintenance_documents').select('id, storage_path').order('id')),
    readAllPages(() => db.from('dossier_publications').select('id, manifest').order('id')),
  ]);
  const named = new Set();
  for (const r of library) if (r.provider_file_id) named.add(String(r.provider_file_id));
  for (const r of media) for (const id of idsIn(r.storage_url)) named.add(id);
  for (const r of maintenance) for (const id of idsIn(r.storage_path)) named.add(id);
  for (const p of publications) {
    for (const f of p.manifest?.files ?? []) if (f?.pinned_file_id) named.add(String(f.pinned_file_id));
  }
  return named;
}

/**
 * Compare what is in Drive with what the portal names.
 * @param {Array<{ fileId: string, name: string, path: string, parentId: string, isFolder: boolean,
 *   size: number, mimeType: string, modifiedAt: string|null }>} items  everything under the portal folder
 * @param {Set<string>} named
 */
export function findUnnamed(items, named) {
  const files = items.filter((i) => !i.isFolder);
  const folders = items.filter((i) => i.isFolder);
  const unnamed = files.filter((f) => !named.has(f.fileId))
    .sort((a, b) => a.path.localeCompare(b.path, 'en-GB', { numeric: true }));

  // A folder is empty when no file sits anywhere beneath it.
  const parentOf = new Map(items.map((i) => [i.fileId, i.parentId]));
  const hasFile = new Set();
  for (const f of files) {
    let p = f.parentId;
    while (p && !hasFile.has(p)) { hasFile.add(p); p = parentOf.get(p) ?? ''; }
  }
  const emptyFolders = folders.filter((f) => !hasFile.has(f.fileId))
    .map((f) => ({ fileId: f.fileId, path: f.path, parentId: f.parentId, modifiedAt: f.modifiedAt }))
    .sort((a, b) => a.path.localeCompare(b.path, 'en-GB', { numeric: true }));

  const sum = (/** @type {Array<{ size: number }>} */ xs) => xs.reduce((n, x) => n + (x.size || 0), 0);
  return {
    totals: {
      files: files.length, folders: folders.length, bytes: sum(files),
      named: files.length - unnamed.length, namedBytes: sum(files) - sum(unnamed),
      unnamed: unnamed.length, unnamedBytes: sum(unnamed),
      emptyFolders: emptyFolders.length,
    },
    unnamed: unnamed.map(({ fileId, name, path, parentId, size, mimeType, modifiedAt }) => ({ fileId, name, path, parentId, size, mimeType, modifiedAt })),
    emptyFolders,
  };
}
