// src/routes/api/dossier/publish-assets/+server.js
// POST /api/dossier/publish-assets — checksum, and optionally pin, the files a
// publication is about to freeze.
//
// Replaces the earlier /api/dossier/checksums. Pinning and checksumming both
// need the whole file, so they happen in ONE pass — see
// #lib/server/publicationAssets.js for both, and for why pinning exists at all.
//
// Called at PUBLISH, never when the review dialog opens. Pinning at review time
// would leave orphaned copies behind every time an author looked and thought
// better of it, and a checksum is only meaningful measured at the moment the
// publication is created.
//
// ⛔ Each file is read only if the caller may read its DOCUMENT
// (canAccessDocument, as every other document route asks). Pinning makes a
// copy the published pack serves, so without the check a Dossier author could
// pin a file they cannot see — a parking licence — and read it through the
// pack link. An earlier note here said "an authenticated user can already
// fetch these bytes through /api/media/file/:id"; that stopped being true on
// 2026-09-27, when the proxy began holding licences to the Parking grant
// (§6ccc item 4, 2026-10-03). A file the caller may not read is treated like
// one not in the library: left unread, shown in the review as a gap.

import { json }           from '@sveltejs/kit';
import { requireAuth }    from '#lib/server/requireAuth.js';
import { prepareAssets, MAX_FILES } from '#lib/server/publicationAssets.js';
import { getDocumentByFileId } from '#lib/server/documentLibrary.js';
import { canAccessDocument, bearerToken } from '#lib/server/documentAccess.js';


export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const files = Array.isArray(body?.files) ? body.files : null;
  if (!files) return json({ error: 'files must be an array' }, { status: 400 });

  // Where each file actually is comes from the document's row, never from the
  // caller. A file id not in the library is not a shelf file, and is left
  // unread (it comes back with no checksum, which the review shows as a gap).
  const caller = { isAdmin: auth.isAdmin, token: bearerToken(request) };
  let known;
  try {
    // prepareAssets reads no more than MAX_FILES, so look up no more either.
    known = await Promise.all(files.slice(0, MAX_FILES).map(async (f) => {
      const id  = String(f?.providerFileId ?? '');
      const doc = id ? await getDocumentByFileId(id) : null;
      if (!doc) return { ...f, providerFileId: '' };
      const allowed = await canAccessDocument(doc, caller);
      return allowed.ok ? { ...f, provider: doc.provider ?? null } : { ...f, providerFileId: '' };
    }));
  } catch { return json({ error: 'Could not look the files up' }, { status: 500 }); }

  const assets = await prepareAssets(known, { pin: body?.pin === true });
  return json({ assets });
}
