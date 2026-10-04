// POST /api/golden-thread/verify-audit
// Golden Thread Stage E: run the tamper-evidence check over the hash-chained
// gt_audit ledger (gt_verify_audit_chain, migration 157). Admin-only; the SQL
// function is service-role-only (execute revoked from authenticated), so we call
// it with the service client after requireAdmin. Returns { ok, checked,
// first_broken_seq, reason }.

import { errMessage } from '../../../../lib/utils/errors.js';
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import * as env from '$app/env/private';
import { requireAdmin } from '#lib/server/requireAuth.js';
import { getLogger } from '#lib/utils/logger.js';

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
    logger('verify failed:', errMessage(err));
    return json({ error: errMessage(err, 'Verification failed') }, { status: 500 });
  }
}
