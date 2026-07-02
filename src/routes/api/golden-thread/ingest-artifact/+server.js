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
// AUTHORISATION (2026-07-02 security review, S2): being authenticated is not
// enough — this endpoint can duplicate any library file, so the target draft is
// verified first: `entityId` must be a real gt_documents row, still in 'draft',
// and CREATED BY THE CALLER. That pins each copy to a register draft the caller
// legitimately owns, and blocks using this endpoint to clone arbitrary files
// onto arbitrary (or bogus) entities.
//
// Body: { sourceDocId, entityId }  (entityId = the caller's draft gt_document id)
// Returns: { storage_uri, file_checksum, sizeBytes, mimeType }

import { json }                from '@sveltejs/kit';
import { createClient }        from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { requireAuth }         from '$lib/server/requireAuth';
import { copyDocument }        from '$lib/server/documentLibrary';
import { getLogger }           from '$lib/utils/logger';

const logger = getLogger('gt-ingest-artifact');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _svc = null;
function getSvc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');
  return _svc;
}

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const { sourceDocId, entityId } = await request.json();
    if (!UUID_RE.test(String(sourceDocId ?? '')) || !UUID_RE.test(String(entityId ?? ''))) {
      return json({ error: 'sourceDocId and entityId must be valid ids.' }, { status: 400 });
    }

    // ── Verify the target draft: exists, still draft, owned by the caller ────
    const { data: draft, error: dErr } = await getSvc()
      .from('gt_documents')
      .select('id, status, created_by')
      .eq('id', entityId)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!draft) {
      return json({ error: 'Target register document not found.' }, { status: 404 });
    }
    if (draft.status !== 'draft') {
      return json({ error: 'Files can only be attached to a draft register document.' }, { status: 409 });
    }
    if (draft.created_by !== auth.user.id) {
      return json({ error: 'Only the creator of the draft can attach its file.' }, { status: 403 });
    }

    // ── Copy the source file into a gt_document-owned library entry ──────────
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
