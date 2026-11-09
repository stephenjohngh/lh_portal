// GET /api/documents/drive-unnamed — files in the portal's Drive folder that no
// record names, and folders with nothing in them (Admin → Records → Documents,
// 2026-11-09). Admin only: it reads every app's records with the service role
// and lists the whole portal folder. ⛔ It changes nothing; see driveUnnamed.js.
import { json }               from '@sveltejs/kit';
import { createClient }       from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import * as env               from '$app/env/private';
import { requireAdmin }       from '#lib/server/requireAuth.js';
import { googleDriveProvider } from '#lib/server/storage/googleDriveProvider.js';
import { collectNamedIds, findUnnamed } from '#lib/server/driveUnnamed.js';

export async function GET({ request }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const db = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');
    // Drive first, then the records: an upload puts its file in Drive and THEN
    // writes its row, so a file that is listed has its row by the time the
    // records are read. (The other way round, an upload in between would be
    // reported as left behind.)
    const { items, truncated } = await googleDriveProvider.listTree();
    const named = await collectNamedIds(db);
    return json({ ...findUnnamed(items, named), truncated, checkedAt: new Date().toISOString() });
  } catch (/** @type {any} */ err) {
    return json({ error: `Drive could not be compared: ${err?.message ?? err}` }, { status: 500 });
  }
}
