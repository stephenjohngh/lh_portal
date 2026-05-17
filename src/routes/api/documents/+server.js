// GET /api/documents — list documents with optional filters
import { json }          from '@sveltejs/kit';
import { listDocuments } from '$lib/server/documentLibrary';
import { requireAuth }   from '$lib/server/requireAuth';

export async function GET({ request, url }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const opts = {
      entity_type:  url.searchParams.get('entity_type')  || undefined,
      entity_id:    url.searchParams.get('entity_id')    || undefined,
      doc_type:     url.searchParams.get('doc_type')     || undefined,
      category:     url.searchParams.get('category')     || undefined,
      folder_path:  url.searchParams.get('folder_path')  || undefined,
      search:       url.searchParams.get('search')       || undefined,
      limit:        Number(url.searchParams.get('limit')) || undefined,
    };
    const docs = await listDocuments(opts);
    return json(docs);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}
