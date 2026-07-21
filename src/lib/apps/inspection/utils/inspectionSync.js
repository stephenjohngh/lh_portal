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

async function syncInspectionSave({ row, photoUrls = [], statusPatch }, deps) {
  await deps.upsertInspection(row);
  // Purge-then-add makes the attachment set idempotent on replay and preserves
  // the existing re-inspect behaviour (a re-inspection replaces the photo set).
  await deps.purgeAttachments('component_inspection', row.id);
  await deps.addAttachments('component_inspection', row.id, photoUrls, row.inspected_by);
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
