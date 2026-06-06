// src/lib/utils/morReference.js
// Pure helper: generate the next MOR case reference using any Supabase client.
// Safe for both client (user-token) and server (service-role) contexts —
// imports no env vars.
//
// Format: MOR-YYYY-NNNNNN (sequential within calendar year).
//
// NOTE: This uses a COUNT query rather than a Postgres sequence and is
// therefore not atomic under concurrent submissions. For Lonsdale House
// volumes this is acceptable. If reference collisions ever become a problem,
// migrate to a per-year sequence + DB function.

/**
 * Generate the next MOR reference for the current calendar year using the
 * provided Supabase client.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<string>}  e.g. 'MOR-2026-000001'
 */
export async function generateMorReference(client) {
  if (!client) throw new Error('generateMorReference: client is required');
  const year = new Date().getFullYear();

  const { count, error } = await client
    .from('mor_cases')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${year}-01-01T00:00:00Z`)
    .lt('created_at',  `${year + 1}-01-01T00:00:00Z`);

  if (error) throw error;
  return `MOR-${year}-${String((count ?? 0) + 1).padStart(6, '0')}`;
}
