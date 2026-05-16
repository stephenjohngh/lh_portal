// GET /api/documents/[id]  — fetch metadata
// PATCH /api/documents/[id] — update metadata
// DELETE /api/documents/[id] — delete file + index row
import { json }                                     from '@sveltejs/kit';
import { getDocument, updateDocument, deleteDocument } from '$lib/server/documentLibrary';

export async function GET({ params }) {
  try {
    const doc = await getDocument(params.id);
    return json(doc);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH({ params, request }) {
  try {
    const { patch, user_id } = await request.json();
    const doc = await updateDocument(params.id, patch, user_id);
    return json(doc);
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE({ params }) {
  try {
    await deleteDocument(params.id);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}
