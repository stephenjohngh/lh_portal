// src/routes/api/dossier/sync-files/+server.js
// POST /api/dossier/sync-files — move a pack's files into the Drive folders its file
// tree asks for (the tree is the truth; Drive is a mirror — see dossierFileSync.js).
//
// Body: { packId, documentIds: [...] } — at most SYNC_MAX_FILES per request; the
// client sends a long list in pieces. Answers { moved, unchanged, skipped, failed }.
//
// Authorisation is the same question as for the pack's own file list: can the CALLER,
// speaking as themselves, read this pack? Packs are owner-scoped, so that is the whole
// test — asked of the database rather than re-implemented here. A viewer of a template
// can therefore read it, but a pack's files are only ever moved by someone who can
// change the pack: the same call is refused to anyone who cannot update it.

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$app/env/public';
import { requireAuth } from '#lib/server/requireAuth.js';
import { canListDocuments, bearerToken } from '#lib/server/documentAccess.js';
import { syncPackFiles, SYNC_MAX_FILES } from '#lib/server/dossierFileSync.js';
import { errMessage } from '#lib/utils/errors.js';

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const packId = String(body?.packId ?? '');
  const ids = Array.isArray(body?.documentIds) ? body.documentIds.map(String) : [];
  if (!packId) return json({ error: 'packId is required' }, { status: 400 });
  if (!ids.length) return json({ error: 'documentIds is required' }, { status: 400 });
  if (ids.length > SYNC_MAX_FILES) {
    return json({ error: `Send at most ${SYNC_MAX_FILES} files at a time.` }, { status: 400 });
  }

  const token = bearerToken(request);
  const caller = { isAdmin: auth.isAdmin, token };
  const readable = await canListDocuments({ entity_type: 'dossier_pack', entity_id: packId }, caller);
  if (!readable.ok) return json({ error: readable.message }, { status: readable.status });

  // Moving files is changing the pack. Ask the database whether THIS caller may update
  // it: a no-op update of the pack's own title, as the caller, passes or fails on RLS
  // (a template is an admin's; a dossier is its owner's).
  const asCaller = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  });
  const { data: mayChange } = await asCaller.from('dossier_packs').select('id, title').eq('id', packId).maybeSingle();
  if (!mayChange) return json({ error: 'Not found.' }, { status: 404 });
  const { data: updated, error: updErr } = await asCaller.from('dossier_packs')
    .update({ title: mayChange.title }).eq('id', packId).select('id');
  if (updErr || !updated?.length) {
    return json({ error: 'You cannot change this pack, so its files were not moved.' }, { status: 403 });
  }

  try {
    return json(await syncPackFiles({ packId, documentIds: ids }));
  } catch (err) {
    return json({ error: errMessage(err) }, { status: 500 });
  }
}
