// src/routes/api/media/file/+server.js
// DELETE /api/media/file — remove stored files, each from the provider that
// actually owns it. Authenticated.
//
// ⛔ WHY THIS REPLACED `DELETE /api/media/file/[fileId]`. That route took a
// single opaque id, guarded it with /^[A-Za-z0-9_-]+$/, and handed it to the
// GLOBALLY ACTIVE provider. Three things were wrong with that and they
// compounded:
//   · a Supabase object path has slashes and dots, so it was rejected 400
//     before reaching any provider;
//   · the active provider is not necessarily the one that wrote the file, so
//     even a well-formed id went to the wrong place after a config change;
//   · the client-side caller only ever extracted DRIVE ids, so non-Drive
//     attachments never produced a request at all.
// Together they made every file written under a previous provider permanently
// undeletable. 30 of them accumulated and had to be removed by a one-off
// script. PROJECT_STATUS §6hh, §6 item 9.
//
// ⚠ GET /api/media/file/[fileId] is untouched and still the image proxy — it is
// Drive-specific by nature (working around Drive's cross-origin 403) and is
// referenced by every <img src> in the portal.
//
// Batch, because purging an entity's attachments deletes several at once and
// the old one-request-per-file loop turned a 12-photo inspection into 12
// round trips.
//
// Always 200 with a per-file result: storage cleanup is best-effort by design
// and must never block the database cleanup that follows it. The caller
// decides what to do with failures; it is not free to be unaware of them.
//
// ⛔ WHO MAY DELETE WHAT (security review, 2026-09-27). This route used to
// check only that the caller was signed in, and then permanently delete any
// storage file it was given a URL for — any photo, certificate, parking
// licence or Golden Thread record, and on an OAuth Drive anything in that
// person's Drive. Each file must now pass canDeleteFile()
// (#lib/server/mediaAccess.js): an attachment names it, no library document
// does, and the caller is an admin or added every attachment that names it.
// Both callers (mediaAttachments.js, maintenanceStore.deleteDocument) delete
// the file BEFORE its row, which is what lets the rows be checked here.

import { json }                 from '@sveltejs/kit';
import { createClient }         from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }  from '$app/env/public';
import * as env from '$app/env/private';
import { findFileReferences, canDeleteFile } from '#lib/server/mediaAccess.js';
import { providerByName }       from '#lib/server/storage/index.js';
import { resolveStorageRef }    from '#lib/server/storage/storageRef.js';
import { friendlyStorageError } from '#lib/server/storage/storageErrors.js';
import { requireAuth }          from '#lib/server/requireAuth.js';
import { getLogger }            from '#lib/utils/logger.js';

const logger = getLogger('MediaFileDelete');

// One entity's photo set, generously. A bound so a malformed caller cannot ask
// for thousands of provider round trips in one request.
const MAX_FILES = 200;

/** @type {any} */
let _db;
const db = () => (_db ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));

export async function DELETE({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Expected a JSON body' }, { status: 400 }); }

  const files = body?.files;
  if (!Array.isArray(files)) {
    return json({ error: 'Expected { files: [{ url, provider }] }' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return json({ error: `Too many files — ${MAX_FILES} at a time` }, { status: 400 });
  }

  const caller = { userId: auth.user.id, isAdmin: auth.isAdmin === true };
  const results = [];
  // The folders the deleted files sat in, to tidy once the batch is done — a
  // walk's photos share one folder, so each is checked once, after the last.
  /** @type {Map<string, any>} */
  const emptied = new Map();
  for (const f of files) {
    const url      = typeof f?.url === 'string' ? f.url : null;
    const declared = typeof f?.provider === 'string' ? f.provider : null;
    const { provider, ref, bucket, reason } = resolveStorageRef(url, declared);

    if (!ref) {
      logger('⚠ not deletable:', url, '—', reason);
      results.push({ url, ok: false, error: reason });
      continue;
    }

    // Fails closed: a lookup that errored leaves the file where it is.
    let allowed;
    try {
      allowed = canDeleteFile(await findFileReferences(db(), ref), caller);
    } catch (/** @type {any} */ err) {
      allowed = { ok: false, reason: `Could not check who may delete this file (${err?.message ?? err}).` };
    }
    if (!allowed.ok) {
      logger('⛔ delete refused:', url, '—', allowed.reason);
      results.push({ url, ok: false, error: allowed.reason });
      continue;
    }

    const impl = providerByName(provider);
    if (!impl) {
      const error = `No provider implementation for "${provider}".`;
      logger('⚠', error);
      results.push({ url, ok: false, error });
      continue;
    }

    // Asked before the delete: afterwards the file cannot say where it was.
    let parent = null;
    if (typeof impl.parentFolderOf === 'function') {
      try { parent = await impl.parentFolderOf(ref); } catch { /* tidying is optional */ }
    }

    try {
      await impl.deleteFile(ref, bucket ? { bucket } : undefined);
      results.push({ url, ok: true });
      if (parent) emptied.set(parent, impl);
    } catch (/** @type {any} */ err) {
      // Already gone is the outcome we wanted; anything else is reported.
      const msg = friendlyStorageError(err);
      const gone = err?.code === 404 || err?.status === 404 || /not found/i.test(msg);
      if (!gone) logger('⚠ deleteFile failed for', url, ':', msg);
      results.push({ url, ok: gone, ...(gone ? {} : { error: msg }) });
    }
  }

  // Bin any record folder left empty (never a category folder — the provider
  // decides). Best-effort: an empty folder is untidy, not a failure.
  for (const [folderId, impl] of emptied) {
    try { await impl.trashFolderIfEmpty?.(folderId); }
    catch (/** @type {any} */ err) { logger('⚠ could not tidy folder', folderId, ':', err?.message ?? err); }
  }

  return json({
    deleted: results.filter(r => r.ok).length,
    failed:  results.filter(r => !r.ok).length,
    results,
  });
}
