// GET    /api/documents/[id] — fetch metadata   (caller must be able to read the owning entity)
// PATCH  /api/documents/[id] — update metadata  (uploader or admin; editable fields only)
// DELETE /api/documents/[id] — delete file + index row (admin only)
//
// GET and PATCH are authorised per ENTITY, not merely per session, for the same
// reason the list route is — see $lib/server/documentAccess.js. This route
// matters just as much: getDocument() selects '*', which includes
// provider_file_id, and that is all anyone needs to pull the bytes from the
// unauthenticated media proxy.
import { json }                                       from '@sveltejs/kit';
import { getDocument, updateDocument, deleteDocument } from '$lib/server/documentLibrary';
import { requireAuth, requireAdmin }                   from '$lib/server/requireAuth';
import {
  canAccessDocument, sanitizeDocumentPatch, bearerToken,
} from '$lib/server/documentAccess';

/** Same wording whether the row is missing or merely not theirs. */
const NOT_FOUND = json({ error: 'Not found' }, { status: 404 });

export async function GET({ request, params }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const doc = await getDocument(params.id);
    const allowed = await canAccessDocument(doc, {
      isAdmin: auth.isAdmin, token: bearerToken(request),
    });
    // 404 rather than 403: a caller must not learn that a document exists by
    // being told they may not see it.
    if (!allowed.ok) return NOT_FOUND;
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

    const allowed = await canAccessDocument(existing, {
      isAdmin: auth.isAdmin, token: bearerToken(request),
    });
    if (!allowed.ok) return NOT_FOUND;

    if (existing.uploaded_by !== auth.user.id && !auth.isAdmin) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const { patch } = await request.json();
    // Editable metadata only. Anything else — entity_type, entity_id,
    // provider_file_id, file_checksum — is either the basis of the
    // authorisation decision above or a fact about the stored bytes.
    const { patch: clean, rejected } = sanitizeDocumentPatch(patch);
    if (rejected.length) {
      return json(
        { error: `These fields cannot be edited: ${rejected.join(', ')}` },
        { status: 400 });
    }
    if (!Object.keys(clean).length) {
      return json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const doc = await updateDocument(params.id, clean, auth.user.id);
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
