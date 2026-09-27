// POST /api/parking/retention — an admin removes what Parking retention says
// is due. Since migration 230 this is the only way anything is removed. See
// $lib/server/parkingRetention.js for why this needs a server route at all: a
// signed licence's file is in storage.
import { json }                from '@sveltejs/kit';
import { createClient }        from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { requireAdmin }        from '$lib/server/requireAuth';
import { deleteDocument }      from '$lib/server/documentLibrary';
import { runParkingRetention } from '$lib/server/parkingRetention';

export async function POST({ request }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const db = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');
    const result = await runParkingRetention(db, { deleteDocument, runBy: auth.user.id });
    return json(result);
  } catch (/** @type {any} */ err) {
    return json({ error: err.message }, { status: 500 });
  }
}
