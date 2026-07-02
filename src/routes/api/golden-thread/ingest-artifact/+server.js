// src/routes/api/golden-thread/ingest-artifact/+server.js
// POST /api/golden-thread/ingest-artifact
//
// Golden Thread producer ingest — copies an EXISTING document_library file (a
// maintenance certificate, an inspection report) into a new, register-owned
// document_library entry, so the Golden Thread record holds its own immutable
// copy (survives the producer deleting theirs). Storage-only: it does NOT create
// the gt_document — that stays client-side under the user's JWT (PB-2), so the
// audit actor is the real user, not a service role.
//
// Body: { sourceDocId, entityId }  (entityId = the draft gt_document id)
// Returns: { storage_uri, file_checksum, sizeBytes, mimeType }

import { json }         from '@sveltejs/kit';
import { requireAuth }  from '$lib/server/requireAuth';
import { copyDocument } from '$lib/server/documentLibrary';
import { getLogger }    from '$lib/utils/logger';

const logger = getLogger('gt-ingest-artifact');

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const { sourceDocId, entityId } = await request.json();
    if (!sourceDocId || !entityId) {
      return json({ error: 'sourceDocId and entityId are required.' }, { status: 400 });
    }

    // Copy the source file into a gt_document-owned library entry.
    const copy = await copyDocument(
      sourceDocId,
      { entity_type: 'gt_document', entity_id: entityId },
      auth.user.id,
    );

    return json({
      storage_uri:   `document_library:${copy.id}`,
      file_checksum: copy.file_checksum,
      sizeBytes:     copy.file_size,
      mimeType:      copy.mime_type,
    });
  } catch (err) {
    logger('❌', err.message);
    return json({ error: err.message }, { status: 500 });
  }
}
