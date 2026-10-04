// src/routes/api/management/activities/[id]/+server.js
// DELETE /api/management/activities/:id — delete an activity, and the document
// it carries if it is a document activity.
//
// ⛔ WHY A SERVER ROUTE (2026-09-27). A document activity's file is a library
// document (`fields.doc_id`, entity_type 'issue'). Deleting the activity used
// to delete only the activity row, so the file stayed in the library and in
// Google Drive with nothing left pointing at it — the user found one the same
// day. Doing both from the browser would not be safe: the library delete is
// admin-only while a creator may delete their own activity for two hours, and
// a browser delete that RLS refuses reports NO error — so the document could
// go while the activity stayed. Here both happen together, under one rule.
//
// Who may: an admin, or whoever added the activity within the last two hours —
// exactly the `activities` delete policy (migration 124), via the same helper
// the UI uses to show the button (canDeleteOwn).
//
// Order: the document FIRST, then the activity — files before rows, as
// everywhere in the document stack. If the document cannot be deleted, the
// activity is kept and the caller told, so the two never drift apart.

import { json }                from '@sveltejs/kit';
import { createClient }        from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import * as env from '$app/env/private';
import { requireAuth }         from '#lib/server/requireAuth.js';
import { deleteDocument }      from '#lib/server/documentLibrary.js';
import { canDeleteOwn }        from '#lib/utils/permissions.js';

/** @type {any} */
let _db;
const db = () => (_db ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));

export async function DELETE({ params, request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { data: activity, error } = await db()
    .from('activities')
    .select('id, issue_id, activity_type, created_by, created_at, fields')
    .eq('id', params.id)
    .maybeSingle();
  if (error)     return json({ error: 'Could not read the activity.' }, { status: 500 });
  if (!activity) return json({ error: 'Not found' }, { status: 404 });

  if (!canDeleteOwn(activity, auth.user.id, auth.isAdmin)) {
    return json({ error: 'Only an administrator, or whoever added this within the last two hours, can delete it.' },
      { status: 403 });
  }

  // Its document — only one that belongs to this activity's issue and that no
  // other activity also names.
  let documentDeleted = false;
  const docId = activity.fields?.doc_id ?? null;
  if (docId) {
    const { data: doc, error: docErr } = await db()
      .from('document_library')
      .select('id, entity_type, entity_id')
      .eq('id', docId)
      .maybeSingle();
    if (docErr) return json({ error: 'Could not read the attached document.' }, { status: 500 });

    if (doc && doc.entity_type === 'issue' && doc.entity_id === activity.issue_id) {
      const { count, error: countErr } = await db()
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('fields->>doc_id', docId)
        .neq('id', activity.id);
      if (countErr) return json({ error: 'Could not check the attached document.' }, { status: 500 });

      if (!count) {
        try {
          await deleteDocument(docId);        // the file, its row, and an emptied folder
          documentDeleted = true;
        } catch (/** @type {any} */ err) {
          return json({
            error: `The document could not be deleted (${err?.message ?? err}), so the activity was kept. Try again.`,
          }, { status: 502 });
        }
      }
    }
  }

  const { error: delErr } = await db().from('activities').delete().eq('id', activity.id);
  if (delErr) return json({ error: delErr.message }, { status: 500 });

  return json({ ok: true, documentDeleted });
}
