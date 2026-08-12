// src/routes/api/dossier/checksums/+server.js
// POST /api/dossier/checksums — SHA-256 of shelf files, for a publication's
// manifest baseline.
//
// Why this exists at publish time rather than at upload time:
// `document_library.file_checksum` exists but the shared upload route never
// populates it (only the Golden Thread does, for its own flow), so most shelf
// files have no baseline at all. A publication therefore computes its own as it
// is created — which is also the more robust arrangement, since the publication
// owns the baseline it will later be compared against.
//
// Why it must happen NOW and not in the drift-detection step: a checksum taken
// later is a baseline for a file that may already have changed. The whole value
// of "this file has not changed since publication" depends on the measurement
// being taken at publication.
//
// Exposure note: an authenticated portal user can already fetch any of these
// bytes through /api/media/file/:id, so returning a digest of them grants
// nothing new. Auth is still required — this is not a public endpoint.

import { json }                 from '@sveltejs/kit';
import { storageProvider }      from '$lib/server/storage/index.js';
import { friendlyStorageError } from '$lib/server/storage/storageErrors.js';
import { requireAuth }          from '$lib/server/requireAuth.js';

/**
 * Bounds. A pack's shelf is normally a handful of files, but publishing must
 * not become a way to stream half of Drive through a serverless function.
 * Anything past a bound comes back as a null checksum, which the manifest
 * already represents honestly.
 */
// Not exported: SvelteKit endpoints may only export HTTP verbs and a small
// fixed set of config names — anything else fails the build.
const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

async function sha256Hex(buffer) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const ids = Array.isArray(body?.fileIds) ? body.fileIds : null;
  if (!ids) return json({ error: 'fileIds must be an array' }, { status: 400 });

  /** @type {Record<string, string|null>} */
  const checksums = {};
  let budget = MAX_TOTAL_BYTES;

  for (const raw of ids.slice(0, MAX_FILES)) {
    const id = String(raw ?? '');
    // The same id guard the media proxy applies.
    if (!/^[A-Za-z0-9_-]+$/.test(id)) { checksums[id] = null; continue; }

    try {
      const { data } = await storageProvider.getFileStream(id);
      if (data.length > budget) { checksums[id] = null; continue; }
      budget -= data.length;
      checksums[id] = await sha256Hex(data);
    } catch (err) {
      // A file that cannot be read gets a null baseline rather than failing the
      // publish. The author is told which ones in the review; a missing
      // checksum is a known gap, not a broken publication.
      console.error('[DossierChecksums] read failed for', id, '—',
        friendlyStorageError(err));
      checksums[id] = null;
    }
  }

  // Anything past MAX_FILES is reported explicitly rather than omitted, so the
  // caller can tell "not computed" from "never asked for".
  for (const raw of ids.slice(MAX_FILES)) checksums[String(raw ?? '')] = null;

  return json({ checksums });
}
