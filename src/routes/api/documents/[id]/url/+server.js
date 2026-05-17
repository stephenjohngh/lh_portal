// GET /api/documents/[id]/url — return a fresh browser-viewable URL for the file
import { json }           from '@sveltejs/kit';
import { getDocumentUrl } from '$lib/server/documentLibrary';
import { requireAuth }    from '$lib/server/requireAuth';

export async function GET({ request, params }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const url = await getDocumentUrl(params.id);
    return json({ url });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}
