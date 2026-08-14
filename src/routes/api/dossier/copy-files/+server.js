// src/routes/api/dossier/copy-files/+server.js
// POST /api/dossier/copy-files — give a duplicated pack its own copies of the
// original's shelf files.
//
// ── Why bytes, and not a second row pointing at the same file ────────────────
// Sharing one stored file between two packs would mean deleting a template's
// logo silently emptied every pack ever made from it, and — worse — that a
// published pack's evidence could be changed by editing a pack it was copied
// from. Packs are independent by design, so their files are too.
//
// Neither storage provider exposes a server-side copy, so this is a read and a
// re-upload per file: exactly what copyDocument() already does for Golden
// Thread producer ingest, reused here. That cost is what the bounds below are
// for — a template is expected to hold a logo and a letterhead, not a shelf.
//
// Authorisation is the same question asked twice: can the CALLER read the pack
// being copied from, and the one being copied to? Both go through
// canListDocuments(), which asks the database rather than re-implementing
// Dossier's owner-scoping here.

import { json }                 from '@sveltejs/kit';
import { requireAuth }          from '$lib/server/requireAuth.js';
import { canListDocuments, bearerToken } from '$lib/server/documentAccess.js';
import { copyPackFiles }        from '$lib/server/dossierPackFiles.js';

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const sourcePackId = String(body?.sourcePackId ?? '');
  const targetPackId = String(body?.targetPackId ?? '');
  if (!sourcePackId || !targetPackId) {
    return json({ error: 'sourcePackId and targetPackId are required' }, { status: 400 });
  }

  const caller = { isAdmin: auth.isAdmin, token: bearerToken(request) };
  for (const packId of [sourcePackId, targetPackId]) {
    const allowed = await canListDocuments(
      { entity_type: 'dossier_pack', entity_id: packId }, caller);
    if (!allowed.ok) return json({ error: allowed.message }, { status: allowed.status });
  }

  try {
    const result = await copyPackFiles(sourcePackId, targetPackId, auth.user.id);
    return json(result);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
