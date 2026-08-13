// GET /api/documents — list documents with optional filters.
//
// Authorised per ENTITY, not merely per session (P3 carry-forward). The listing
// itself runs with the service role — document_library is shared infrastructure
// and RLS does not apply to it — so being signed in was previously enough to
// read the attachments of any entity in the portal. See
// $lib/server/documentAccess.js for what that meant and how it is decided now.
import { json }              from '@sveltejs/kit';
import { listDocuments }     from '$lib/server/documentLibrary';
import { requireAuth }       from '$lib/server/requireAuth';
import { canListDocuments, bearerToken } from '$lib/server/documentAccess';

export async function GET({ request, url }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const opts = {
    entity_type:  url.searchParams.get('entity_type')  || undefined,
    entity_id:    url.searchParams.get('entity_id')    || undefined,
    doc_type:     url.searchParams.get('doc_type')     || undefined,
    category:     url.searchParams.get('category')     || undefined,
    folder_path:  url.searchParams.get('folder_path')  || undefined,
    search:       url.searchParams.get('search')       || undefined,
    limit:        Number(url.searchParams.get('limit')) || undefined,
  };

  const allowed = await canListDocuments(opts, {
    isAdmin: auth.isAdmin,
    token:   bearerToken(request),
  });
  if (!allowed.ok) {
    return json({ error: allowed.message }, { status: allowed.status });
  }

  try {
    const docs = await listDocuments(opts);
    return json(docs);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}
