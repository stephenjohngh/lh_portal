// src/lib/server/storage/folderNames.js
// Recognising a per-record folder by the short id it ends with.
//
// entityFolderPath() ($lib/utils/documentUtils.js) names a record's folder
// `<title> (<first 8 hex of its id>)` — or just the 8 hex when there is no
// title. The title part can change (a note renamed, a pack retitled); the
// short id cannot. So the short id, not the whole name, is what says "this is
// that record's folder" (fixed 2026-09-27: a rename used to start a second
// folder beside the first).

const KEYED = /\(([0-9a-f]{8})\)$/;
const BARE  = /^[0-9a-f]{8}$/;

/**
 * The record key a folder name carries, or null for any other folder
 * (a category such as `Info Notes`, `Issue 49`, a walk's folder).
 * @param {string|null|undefined} name
 * @returns {string|null}
 */
export function folderKey(name) {
  const s = String(name ?? '').trim();
  const m = s.match(KEYED);
  if (m) return m[1];
  return BARE.test(s) ? s : null;
}
