// src/routes/api/media/file/[fileId]/+server.js
// GET /api/media/file/:fileId — proxy file bytes to browser (unauthenticated)
//
// ⚠ GET ONLY. Deleting lives at `../+server.js` — see the note where the DELETE
// handler used to be, at the foot of this file.
//
// GET: Server-side image proxy — fetches a file from the configured storage
// provider and re-serves the bytes to the browser.
//
// Why: Google Drive's drive.google.com URLs return 403 when requested as
// cross-origin <img src> (Sec-Fetch-Site: cross-site).  By proxying through
// the portal's own origin the browser sees a same-origin image request and
// Drive never receives a cross-origin header.
//
// Auth (GET): intentionally unauthenticated.  Drive file IDs are opaque
// ~33-char random strings.  A caller would need authenticated DB access to
// learn any valid ID, so obscurity provides adequate protection for inspection
// photos and similar non-sensitive internal imagery.
//
// Caching: private, 1-hour max-age.  Browsers re-validate on hard-refresh.

import { json }                 from '@sveltejs/kit';
import { storageProvider }      from '$lib/server/storage/index.js';
import { friendlyStorageError } from '$lib/server/storage/storageErrors.js';
import { getLogger }            from '$lib/utils/logger';
import { declarableMime }       from '$lib/utils/mimeTypes';

const logger = getLogger('MediaFileProxy');

export async function GET({ params, url }) {
  const { fileId } = params;

  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return json({ error: 'Invalid file ID' }, { status: 400 });
  }

  try {
    const { data, mimeType } = await storageProvider.getFileStream(fileId);

    // A caller may declare the type it recorded at upload. Storage providers
    // report what they stored, which is wrong for anything uploaded before the
    // type was captured properly — a PDF held as octet-stream downloads rather
    // than rendering. The hint is re-validated here against a tiny allow-list
    // of inline-renderable, non-scriptable types, so it can never be used to
    // relabel a file as something executable.
    const declared = declarableMime(url.searchParams.get('mime')) || mimeType;

    return new Response(data, {
      headers: {
        'Content-Type':   declared,
        'Cache-Control':  'private, max-age=3600',
        'Content-Length': String(data.length),
        // These are user-uploaded bytes served from our own origin. Without
        // nosniff a browser may ignore the declared type and sniff the content
        // — e.g. treating an uploaded file as HTML and running it here.
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    // The response stays deliberately vague — this endpoint is unauthenticated,
    // so it must not narrate storage internals to a caller. But the cause has
    // to reach the operator: `logger` is debug-namespaced and silent unless
    // DEBUG is set, which made this 404 undiagnosable. console.error always
    // prints, and a failed file fetch is a genuine error worth seeing.
    console.error('[MediaFileProxy] fetch failed for', fileId, '—',
      friendlyStorageError(err), err?.code ?? '', err?.stack ?? '');
    return json({ error: 'File not found or inaccessible' }, { status: 404 });
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
