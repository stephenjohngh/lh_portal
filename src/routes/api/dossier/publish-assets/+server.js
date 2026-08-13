// src/routes/api/dossier/publish-assets/+server.js
// POST /api/dossier/publish-assets — checksum, and optionally pin, the files a
// publication is about to freeze.
//
// Replaces the earlier /api/dossier/checksums. Pinning and checksumming both
// need the whole file, so they happen in ONE pass — see
// $lib/server/publicationAssets.js for both, and for why pinning exists at all.
//
// Called at PUBLISH, never when the review dialog opens. Pinning at review time
// would leave orphaned copies behind every time an author looked and thought
// better of it, and a checksum is only meaningful measured at the moment the
// publication is created.
//
// Exposure note: an authenticated portal user can already fetch these bytes
// through /api/media/file/:id, so returning a digest of them grants nothing
// new. Auth is still required — this is not a public endpoint.

import { json }           from '@sveltejs/kit';
import { requireAuth }    from '$lib/server/requireAuth.js';
import { prepareAssets }  from '$lib/server/publicationAssets.js';

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const files = Array.isArray(body?.files) ? body.files : null;
  if (!files) return json({ error: 'files must be an array' }, { status: 400 });

  const assets = await prepareAssets(files, { pin: body?.pin === true });
  return json({ assets });
}
