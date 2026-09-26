// GET /api/documents/[id]/url — return a fresh browser-viewable URL for the file
//
// Authorised per ENTITY, like GET /api/documents/[id]: a URL to the bytes is
// worth more than the metadata, and this route used to check only that the
// caller was signed in.
import { json }           from '@sveltejs/kit';
import { getDocument, getDocumentUrl } from '$lib/server/documentLibrary';
import { requireAuth }    from '$lib/server/requireAuth';
import { canAccessDocument, bearerToken } from '$lib/server/documentAccess';

export async function GET({ request, params }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const doc = await getDocument(params.id);
    const allowed = await canAccessDocument(doc, { isAdmin: auth.isAdmin, token: bearerToken(request) });
    if (!allowed.ok) return json({ error: 'Not found' }, { status: 404 });
    const url = await getDocumentUrl(params.id);
    return json({ url });
  } catch (/** @type {any} */ err) {
    return json({ error: err.message }, { status: 500 });
  }
}
