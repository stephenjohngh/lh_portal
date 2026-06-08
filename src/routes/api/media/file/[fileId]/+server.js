// src/routes/api/media/file/[fileId]/+server.js
// GET /api/media/file/:fileId
//
// Server-side image proxy — fetches a file from the configured storage
// provider and re-serves the bytes to the browser.
//
// Why: Google Drive's drive.google.com URLs return 403 when requested as
// cross-origin <img src> (Sec-Fetch-Site: cross-site).  By proxying through
// the portal's own origin the browser sees a same-origin image request and
// Drive never receives a cross-origin header.
//
// Auth: intentionally unauthenticated.  Drive file IDs are opaque ~33-char
// random strings.  A caller would need authenticated DB access to learn any
// valid ID, so obscurity provides adequate protection for inspection photos
// and similar non-sensitive internal imagery.  If the payload is ever
// genuinely sensitive, add requireAuth() and switch <img src> to a blob-URL
// approach (fetch with Authorization header → URL.createObjectURL()).
//
// Caching: private, 1-hour max-age.  Browsers re-validate on hard-refresh.

import { json }            from '@sveltejs/kit';
import { storageProvider } from '$lib/server/storage/index.js';
import { getLogger }       from '$lib/utils/logger';

const logger = getLogger('MediaFileProxy');

export async function GET({ params }) {
  const { fileId } = params;

  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return json({ error: 'Invalid file ID' }, { status: 400 });
  }

  try {
    const { data, mimeType } = await storageProvider.getFileStream(fileId);

    return new Response(data, {
      headers: {
        'Content-Type':   mimeType,
        'Cache-Control':  'private, max-age=3600',
        'Content-Length': String(data.length),
      },
    });
  } catch (err) {
    logger('⚠ proxy fetch failed for', fileId, ':', err.message);
    return json({ error: 'File not found or inaccessible' }, { status: 404 });
  }
}
