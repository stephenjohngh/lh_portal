// POST /api/golden-thread/verify-audit
// Golden Thread Stage E: run the tamper-evidence check over the hash-chained
// gt_audit ledger (gt_verify_audit_chain, migration 157). Admin-only; the SQL
// function is service-role-only (execute revoked from authenticated), so we call
// it with the service client after requireAdmin. Returns { ok, checked,
// first_broken_seq, reason }.

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/requireAuth';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('GtVerifyAudit');
const db = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');

export async function POST({ request }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { data, error } = await db.rpc('gt_verify_audit_chain');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return json(row ?? { ok: true, checked: 0, first_broken_seq: null, reason: null });
  } catch (err) {
    logger('verify failed:', err instanceof Error ? err.message : String(err));
    return json({ error: err instanceof Error ? err.message : 'Verification failed' }, { status: 500 });
  }
}
