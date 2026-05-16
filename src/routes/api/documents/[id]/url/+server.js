// GET /api/documents/[id]/url — return a fresh browser-viewable URL for the file
import { json }           from '@sveltejs/kit';
import { getDocumentUrl } from '$lib/server/documentLibrary';

export async function GET({ params }) {
  try {
    const url = await getDocumentUrl(params.id);
    return json({ url });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}
