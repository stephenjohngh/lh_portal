// src/routes/api/dossier/publications/[id]/verify/+server.js
// POST /api/dossier/publications/:id/verify — has anything changed since this
// was published?
//
// The author-facing half of decision #5. A snapshot publication serves PINNED
// bytes, so its recipient is safe either way — but the author still wants to
// know that the source document has moved on. A follow-latest publication has
// no pin, so a changed file means the recipient's view has actually changed.
//
// Authenticated and owner-scoped: the RLS SELECT on dossier_publications is
// what decides whether this caller may see this publication at all. The service
// role is deliberately NOT used here — this is the internal boundary, and it
// should be enforced by the same policy as every other authoring read.

import { json }             from '@sveltejs/kit';
import { createClient }     from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { requireAuth }      from '$lib/server/requireAuth.js';
import { verifyManifest, describeVerification } from '$lib/server/publicationAssets.js';

export async function POST({ params, request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  // A client carrying the caller's own token, so RLS applies exactly as it does
  // in the app. An owner sees their publication; anyone else sees nothing.
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const db = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await db
    .from('dossier_publications')
    .select('id, mode, manifest')
    .eq('id', params.id)
    .maybeSingle();

  if (error || !data) return json({ error: 'Not found' }, { status: 404 });

  const result = await verifyManifest(data.manifest);
  return json({ result, message: describeVerification(result, data.mode) });
}
