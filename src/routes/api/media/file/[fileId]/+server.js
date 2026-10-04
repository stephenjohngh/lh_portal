// src/routes/api/media/file/[fileId]/+server.js
// GET /api/media/file/:fileId — stream a stored file to a signed-in user.
//
// ⚠ GET ONLY. Deleting lives at `../+server.js` — see the note at the foot of
// this file.
//
// Why a proxy at all: Google Drive's own URLs return 403 when used as a
// cross-origin <img src>, and since the security review Drive files are no
// longer shared "anyone with the link", so the portal's origin is the only way
// a browser sees them.
//
// ⛔ WHO MAY USE IT (security review, 2026-09-27). This route used to be
// unauthenticated, on the grounds that a file id is unguessable, and it would
// fetch ANY id the Drive credential could read — not only the portal's files —
// for anyone, for ever. It now requires, in order:
//   1. a media session cookie (HttpOnly, path /api/media, signed, 12 hours),
//      set by POST /api/auth/media-session from the bearer token — an <img>
//      cannot send a bearer header, which is the whole reason for the cookie;
//   2. that the user still exists (re-read every request, so deleting a user
//      stops their access at once);
//   3. that a portal record names the file, and for a parking licence that the
//      user holds the Parking grant (#lib/server/mediaAccess.js);
// and the Drive provider refuses any file outside the portal's own folder.
//
// ⛔ WHAT IT SERVES AS: the portal's own record of the type, then a caller's
// hint, then the provider's — and #lib/server/fileResponse.js lets only the
// non-scriptable allow-list render inline. An uploaded .html used to come back
// as text/html from this origin, and ran.
//
// Caching: private, 1-hour max-age.

import { json }                 from '@sveltejs/kit';
import { createClient }         from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }  from '$app/env/public';
import * as env from '$app/env/private';
import { storageProvider }      from '#lib/server/storage/index.js';
import { friendlyStorageError } from '#lib/server/storage/storageErrors.js';
import { declarableMime }       from '#lib/utils/mimeTypes.js';
import { fileHeaders }          from '#lib/server/fileResponse.js';
import {
  MEDIA_COOKIE, readMediaSession, loadViewer, findFileReferences, canViewFile, describeFile,
} from '#lib/server/mediaAccess.js';

/** @type {any} */
let _db;
const db = () => (_db ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));

// Deliberately vague: whether a file exists is nobody's business but a
// permitted viewer's, so "not yours" and "not there" read the same.
const notFound   = () => json({ error: 'File not found or inaccessible' }, { status: 404 });
const signInFirst = () => json({ error: 'Sign in to view this file.' }, { status: 401 });

export async function GET({ params, url, cookies }) {
  const { fileId } = params;

  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return json({ error: 'Invalid file ID' }, { status: 400 });
  }

  const userId = readMediaSession(cookies.get(MEDIA_COOKIE));
  if (!userId) return signInFirst();

  let viewer, refs;
  try {
    [viewer, refs] = await Promise.all([loadViewer(db(), userId), findFileReferences(db(), fileId)]);
  } catch (/** @type {any} */ err) {
    // Fail closed: a lookup that could not run proves nothing.
    console.error('[MediaFileProxy] access lookup failed for', fileId, '—', err?.message ?? err);
    return notFound();
  }
  if (!viewer) return signInFirst();
  if (!canViewFile(refs, viewer)) return notFound();

  try {
    const { data, mimeType } = await storageProvider.getFileStream(fileId);
    const meta = describeFile(refs);
    const mime = declarableMime(meta.mime) || declarableMime(url.searchParams.get('mime')) || mimeType;
    return new Response(data, {
      headers: fileHeaders({ mime, filename: meta.filename, length: data.length, cacheControl: 'private, max-age=3600' }),
    });
  } catch (/** @type {any} */ err) {
    // `logger` is debug-namespaced and silent unless DEBUG is set, which made
    // this 404 undiagnosable. A failed fetch is a genuine error worth seeing.
    console.error('[MediaFileProxy] fetch failed for', fileId, '—',
      friendlyStorageError(err), err?.code ?? '', err?.stack ?? '');
    return notFound();
  }
}

// ⛔ THE DELETE HANDLER THAT WAS HERE HAS MOVED TO `../+server.js`, and moving
// it was the fix rather than a tidy-up. It took one opaque id, guarded it with
// /^[A-Za-z0-9_-]+$/ — which a Supabase object path fails on both slashes and
// dots — and handed it to the GLOBALLY ACTIVE provider, which is not
// necessarily the one that wrote the file. Neither limitation is expressible
// in this route's shape, because a path cannot be a single `[fileId]` segment.
// The replacement takes { url, provider } per file and routes each to its own
// provider. PROJECT_STATUS §6hh. ⚠ Do not re-add a delete here.
