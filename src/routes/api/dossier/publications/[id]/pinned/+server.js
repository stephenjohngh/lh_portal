// DELETE /api/dossier/publications/:id/pinned — remove a publication's pinned
// copies from storage, before the publication row is deleted. Admin only, as
// deleting the publication is. See #lib/server/pinnedCopies.js.
//
// Returns what was removed and what was not. The caller keeps the publication
// when anything failed: its manifest is the only record naming those copies,
// and deleting it would strand them.
import { json }                from '@sveltejs/kit';
import { createClient }        from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { requireAdmin }        from '#lib/server/requireAuth.js';
import { removePinnedCopies }  from '#lib/server/pinnedCopies.js';

export async function DELETE({ request, params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const db = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');
  const { data, error } = await db
    .from('dossier_publications').select('id, manifest').eq('id', params.id).maybeSingle();
  if (error) return json({ error: error.message }, { status: 500 });
  if (!data) return json({ error: 'Not found' }, { status: 404 });

  return json(await removePinnedCopies(data.manifest));
}
