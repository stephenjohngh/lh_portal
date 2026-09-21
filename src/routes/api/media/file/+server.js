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

import { json }                 from '@sveltejs/kit';
import { providerByName }       from '$lib/server/storage/index.js';
import { resolveStorageRef }    from '$lib/server/storage/storageRef.js';
import { friendlyStorageError } from '$lib/server/storage/storageErrors.js';
import { requireAuth }          from '$lib/server/requireAuth.js';
import { getLogger }            from '$lib/utils/logger';

const logger = getLogger('MediaFileDelete');

// One entity's photo set, generously. A bound so a malformed caller cannot ask
// for thousands of provider round trips in one request.
const MAX_FILES = 200;

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

  const results = [];
  for (const f of files) {
    const url      = typeof f?.url === 'string' ? f.url : null;
    const declared = typeof f?.provider === 'string' ? f.provider : null;
    const { provider, ref, bucket, reason } = resolveStorageRef(url, declared);

    if (!ref) {
      logger('⚠ not deletable:', url, '—', reason);
      results.push({ url, ok: false, error: reason });
      continue;
    }

    const impl = providerByName(provider);
    if (!impl) {
      const error = `No provider implementation for "${provider}".`;
      logger('⚠', error);
      results.push({ url, ok: false, error });
      continue;
    }

    try {
      await impl.deleteFile(ref, bucket ? { bucket } : undefined);
      results.push({ url, ok: true });
    } catch (/** @type {any} */ err) {
      // Already gone is the outcome we wanted; anything else is reported.
      const msg = friendlyStorageError(err);
      const gone = err?.code === 404 || err?.status === 404 || /not found/i.test(msg);
      if (!gone) logger('⚠ deleteFile failed for', url, ':', msg);
      results.push({ url, ok: gone, ...(gone ? {} : { error: msg }) });
    }
  }

  return json({
    deleted: results.filter(r => r.ok).length,
    failed:  results.filter(r => !r.ok).length,
    results,
  });
}
