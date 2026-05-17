// GET    /api/documents/[id] — fetch metadata          (any authenticated user)
// PATCH  /api/documents/[id] — update metadata         (uploader or admin; trusts RLS via app-layer check)
// DELETE /api/documents/[id] — delete file + index row (admin only)
import { json }                                       from '@sveltejs/kit';
import { getDocument, updateDocument, deleteDocument } from '$lib/server/documentLibrary';
import { requireAuth, requireAdmin }                   from '$lib/server/requireAuth';

export async function GET({ request, params }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const doc = await getDocument(params.id);
    return json(doc);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH({ request, params }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const existing = await getDocument(params.id);
    if (existing.uploaded_by !== auth.user.id && !auth.isAdmin) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const { patch } = await request.json();
    const doc = await updateDocument(params.id, patch, auth.user.id);
    return json(doc);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE({ request, params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    await deleteDocument(params.id);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}
