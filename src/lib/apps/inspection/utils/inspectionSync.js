// src/lib/apps/inspection/utils/inspectionSync.js
//
// Performs the server work for ONE outbox op, through injected `deps` — so it has
// no direct import of api/supabase and is unit-testable with mocks. The runner
// (syncRunner.js) calls syncOne and acts on its result:
//
//   { ok: true }                          → mark the op done
//   { ok: false, permanent: true, error } → mark it error and skip (won't retry)
//   { ok: false, permanent: false, error }→ leave it pending, stop draining
//                                           (retry on the next reconnect / kick)
//
// Everything here is IDEMPOTENT, because the outbox may be replayed after a
// partial sync (a crash or dropped connection between sub-steps):
//   • ids are client-chosen, so every insert is an upsert-by-id;
//   • attachments are purge-then-add, so a retry after a partial add converges;
//   • the status patch and the session-complete update set fixed values.
// Running an op twice therefore lands on the same server state as running it once.

/**
 * @param {{ type: string, payload: object }} op
 * @param {object} deps  see makeSyncDeps() in inspectionSyncDeps.js
 * @returns {Promise<{ ok: boolean, permanent?: boolean, error?: string }>}
 */
export async function syncOne(op, deps) {
  try {
    switch (op.type) {
      case 'inspection_save':  await syncInspectionSave(op.payload, deps);  return { ok: true };
      case 'session_create':   await syncSessionCreate(op.payload, deps);   return { ok: true };
      case 'session_complete': await syncSessionComplete(op.payload, deps); return { ok: true };
      default: return { ok: false, permanent: true, error: `Unknown op type: ${op.type}` };
    }
  } catch (e) {
    return classifyError(e);
  }
}

async function syncInspectionSave({ row, photoUrls = [], photoIds = [], statusPatch }, deps) {
  await deps.upsertInspection(row);

  // Resolve any locally-queued photo blobs to Drive URLs. Idempotent: a photo
  // already uploaded on a previous (partial) attempt is skipped via its stored
  // url, so a retry never double-uploads. The blobs themselves are deleted by the
  // runner only once the whole op is done, so `urls` is always the complete set
  // even across a crash mid-op.
  // ⛔ Each entry carries WHICH PROVIDER took the file, not just its url. The
  // server tells us on upload and this used to discard it, which is why every
  // media_attachments row was written with a null storage_provider and could
  // only be deleted by guessing. PROJECT_STATUS §6hh.
  // ⚠ `photoUrls` are bare strings from the panel — already uploaded before
  // this op was enqueued, with no provider to hand. They are passed through as
  // strings and fall back to URL inference at delete time.
  const urls = [...photoUrls];
  for (const photoId of photoIds) {
    const photo = await deps.getPhoto(photoId);
    if (!photo) continue;                                   // coalesced away — skip
    if (photo.uploaded && photo.url) {
      urls.push({ url: photo.url, provider: photo.provider ?? null });
      continue;
    }
    const up = await deps.uploadPhoto(photo.blob, { filename: photo.filename, folderPath: photo.folderPath });
    // Tolerate a deps implementation that still returns a bare url.
    const item = typeof up === 'string' ? { url: up, provider: null } : up;
    await deps.markPhotoUploaded(photoId, item.url, item.provider ?? null);
    urls.push(item);
  }

  // ⛔ THIS WAS purgeAttachments THEN addAttachments, AND THAT DELETED FILES IT
  // WAS ABOUT TO REUSE. Idempotent for the rows, catastrophic for the storage:
  // on a replay after a partially-completed op, every url below was already
  // attached from the previous attempt — so the purge deleted those files and
  // the add re-created rows pointing at nothing. Nothing errored, and the rows
  // looked perfect. PROJECT_STATUS §6jj.
  //
  // ⭐ `setAttachments` reconciles instead: a file is deleted only when it is
  // no longer referenced, never merely because the set is being rewritten. A
  // replay is then a genuine no-op, and a re-inspection that really does drop
  // a photo still removes its file.
  await deps.setAttachments('component_inspection', row.id, urls, row.inspected_by);
  if (statusPatch) await deps.applyStatusPatch(row.component_id, statusPatch);
}

async function syncSessionCreate({ row }, deps) {
  await deps.upsertSession(row);
}

async function syncSessionComplete({ sessionId, fields }, deps) {
  await deps.completeSession(sessionId, fields);
}

/**
 * Classify a thrown error as permanent (a database rejection — a retry can't fix
 * it) or transient (a network/transport failure — retry when back online). A
 * PostgREST rejection carries a `.code` (e.g. '23503' FK, '23514' CHECK); a
 * fetch/offline failure does not. See api.js handleError, which propagates `.code`.
 * @param {any} e
 */
export function classifyError(e) {
  const permanent = !!(e && e.code != null);
  return { ok: false, permanent, error: e?.message ?? String(e) };
}
