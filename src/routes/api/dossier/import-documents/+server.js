// src/routes/api/dossier/import-documents/+server.js
// POST /api/dossier/import-documents — copy documents from other records (an
// issue's attachments) onto a pack's shelf, for a pack built from a plan.
// Body: { targetPackId, items: [{ documentId, folderPath?, description? }] }
//
// The caller must be able to read the target pack's documents AND each source
// document where it lives (the same check the document routes make).

import { errMessage } from '../../../../lib/utils/errors.js';
import { json }                 from '@sveltejs/kit';
import { requireAuth }          from '#lib/server/requireAuth.js';
import { canListDocuments, bearerToken } from '#lib/server/documentAccess.js';
import { importDocumentsIntoPack } from '#lib/server/dossierImportDocuments.js';

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const targetPackId = String(body?.targetPackId ?? '');
  const items = Array.isArray(body?.items)
    ? body.items.map(i => ({
        documentId: String(i?.documentId ?? ''),
        folderPath: typeof i?.folderPath === 'string' ? i.folderPath : undefined,
        description: typeof i?.description === 'string' ? i.description : null,
      })).filter(i => i.documentId)
    : [];
  if (!targetPackId || !items.length) return json({ error: 'targetPackId and items are required' }, { status: 400 });

  const caller = { isAdmin: auth.isAdmin, token: bearerToken(request) };
  const allowed = await canListDocuments({ entity_type: 'dossier_pack', entity_id: targetPackId }, caller);
  if (!allowed.ok) return json({ error: allowed.message }, { status: allowed.status });

  try {
    return json(await importDocumentsIntoPack(targetPackId, items, auth.user.id, caller));
  } catch (err) {
    return json({ error: errMessage(err) }, { status: 500 });
  }
}
