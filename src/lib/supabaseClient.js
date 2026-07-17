import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

// The DB is fixed by the server's env — one server, one database.
// (A localStorage "lh_db_override" mechanism used to live here, letting an admin
// repoint the BROWSER at another Supabase project. Removed 2026-07-17: it only
// swapped the client side, so /api/* routes kept talking to the env DB — reads
// and writes could hit different databases. Run a second server in its own env
// instead: `npm run dev:devdb`, docs/dev_db_refresh.md §5.7.)
if (typeof localStorage !== 'undefined') {
  try { localStorage.removeItem('lh_db_override'); } catch { /* private mode etc. */ }
}

if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials!');
}

/**
 * Typed Supabase client. The `<Database>` generic (from the generated
 * database.types) makes direct `supabase.from('table')…` calls return typed
 * Row/Insert/Update shapes, so destructured query results are checked instead
 * of `any`. Regenerate types with `node scripts/gen-db-types.mjs`.
 * @type {import('@supabase/supabase-js').SupabaseClient<import('$lib/database.types').Database>}
 */
export const supabase    = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
// The project this build talks to — shown in the env banner and the home page's
// config line.
export const activeDbUrl = PUBLIC_SUPABASE_URL;
