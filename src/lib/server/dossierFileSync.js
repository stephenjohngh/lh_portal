// src/lib/server/dossierFileSync.js
// Bring a pack's files into the Drive folders its file tree asks for.
//
// The database tree is the source of truth; Drive is a best-effort MIRROR (see
// #lib/apps/dossier/utils/fileSync.js). For each requested file this works out the
// storage folder the tree wants, makes sure that folder exists, and moves the file
// there if it is somewhere else.
//
// Why moving FILES is enough, and no folder-move call is needed: a record's Drive
// folder is found by the short id its name ends with (and renamed to match), so a
// renamed folder is simply renamed in place by ensurePath(); a folder moved to a new
// parent is found under that parent by nobody, so a new one is made there, the files
// move into it, and the emptied old one is binned. Same end state, and it works with
// the two calls every provider already has.
//
// Never throws for one file: a file that cannot be moved is reported and left where it
// is — it still opens, because its row holds the provider file id. Done in small
// batches by the caller, because each file is a few Drive calls and a request has a
// time limit.

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import * as env from '$app/env/private';
import { ownerOf } from './storage/index.js';
import { listDocuments } from './documentLibrary.js';
import { desiredPathFor } from '#lib/apps/dossier/utils/fileSync.js';
import { getLogger } from '#lib/utils/logger.js';

const logger = getLogger('DossierFileSync');

/** Most files one request may ask about. */
export const SYNC_MAX_FILES = 25;

const defaultDb = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');

/** Can this provider move a file and say where it is? (Drive can; the others are not mirrored.) */
const canMirror = (p) => typeof p?.parentFolderOf === 'function' && typeof p?.moveFile === 'function'
  && typeof p?.ensurePath === 'function';

/**
 * @param {{ packId: string, documentIds: string[] }} input
 * @param {{ db?: any, ownerOf?: Function, listDocuments?: Function }} [deps]
 * @returns {Promise<{
 *   moved: { document_id: string, folder_path: string }[],
 *   unchanged: { document_id: string, folder_path: string }[],
 *   skipped: { document_id: string, filename: string, reason: string }[],
 *   failed: { document_id: string, filename: string, reason: string }[] }>}
 */
export async function syncPackFiles({ packId, documentIds }, deps = {}) {
  const db = deps.db ?? defaultDb;
  const providerFor = deps.ownerOf ?? ownerOf;
  const list = deps.listDocuments ?? listDocuments;

  const wanted = new Set((documentIds ?? []).slice(0, SYNC_MAX_FILES));
  const out = { moved: [], unchanged: [], skipped: [], failed: [] };
  if (!wanted.size) return out;

  const [{ data: pack, error: packErr }, { data: folders }, { data: placements }, files] = await Promise.all([
    db.from('dossier_packs').select('id, title').eq('id', packId).maybeSingle(),
    db.from('dossier_folders').select('id, parent_id, name').eq('pack_id', packId),
    db.from('dossier_file_placements').select('document_id, folder_id').eq('pack_id', packId),
    list({ entity_type: 'dossier_pack', entity_id: packId }),
  ]);
  if (packErr || !pack) throw new Error('That pack could not be found.');

  // Only the pack's OWN files, and only those asked for: an id from anywhere else is ignored.
  const mine = (files ?? []).filter((f) => wanted.has(f.id));

  /** path → folder id, so a batch of files in one folder asks Drive once. */
  const leafFor = new Map();
  /** old parent folder ids to tidy, with the provider that owns each */
  const tidyList = new Map();

  for (const file of mine) {
    const name = file.display_name || file.filename || 'a file';
    try {
      const provider = providerFor(file.provider);
      if (!canMirror(provider)) {
        out.skipped.push({ document_id: file.id, filename: name, reason: 'This file’s storage cannot be rearranged into folders.' });
        continue;
      }
      const path = desiredPathFor(pack, file, folders ?? [], placements ?? []);
      let leaf = leafFor.get(`${file.provider}|${path}`);
      if (!leaf) {
        leaf = await provider.ensurePath(path.split('/').filter(Boolean));
        leafFor.set(`${file.provider}|${path}`, leaf);
      }
      const current = file.provider_folder_id ?? await provider.parentFolderOf(file.provider_file_id);

      if (current && current === leaf) {
        if ((file.folder_path ?? '') !== path) await recordPlace(db, file.id, path, leaf);
        out.unchanged.push({ document_id: file.id, folder_path: path });
        continue;
      }
      await provider.moveFile(file.provider_file_id, leaf);
      await recordPlace(db, file.id, path, leaf);
      if (current) tidyList.set(`${file.provider}|${current}`, { provider, folderId: current });
      out.moved.push({ document_id: file.id, folder_path: path });
    } catch (/** @type {any} */ err) {
      logger('⚠ could not sync', file.id, '—', err?.message ?? err);
      out.failed.push({ document_id: file.id, filename: name, reason: err?.message ?? 'It could not be moved.' });
    }
  }

  // Bin the folders the moves emptied — and their parents, for as long as each one is
  // empty too (a moved tree leaves a whole empty branch). The provider decides what may be
  // binned and never touches a category folder or the root; it answers false for a folder
  // that still holds something, which is where this stops. Untidy at worst, so never an error.
  for (const { provider, folderId } of tidyList.values()) {
    let id = folderId;
    for (let hops = 0; id && hops < 8; hops++) {
      try {
        const parent = typeof provider.parentFolderOf === 'function' ? await provider.parentFolderOf(id) : null;
        const gone = await provider.trashFolderIfEmpty?.(id);
        if (!gone) break;
        id = parent;
      } catch (/** @type {any} */ err) {
        logger('⚠ could not tidy folder', id, '—', err?.message ?? err);
        break;
      }
    }
  }
  return out;
}

async function recordPlace(db, id, folderPath, folderId) {
  const { error } = await db.from('document_library')
    .update({ folder_path: folderPath, provider_folder_id: folderId }).eq('id', id);
  if (error) throw new Error(`The file moved but its record could not be updated: ${error.message}`);
}
