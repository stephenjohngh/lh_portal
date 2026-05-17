// GET /api/documents/folders?path=some/path — list folders at a given storage path
import { json }        from '@sveltejs/kit';
import { listFolders } from '$lib/server/documentLibrary';
import { requireAuth } from '$lib/server/requireAuth';

export async function GET({ request, url }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const path    = url.searchParams.get('path') || '';
    const folders = await listFolders(path);
    return json(folders);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}
