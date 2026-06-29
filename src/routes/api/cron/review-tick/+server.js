// src/routes/api/cron/review-tick/+server.js
//
// Golden Thread review-tick scheduler ENTRYPOINT (build step 7).
//
// Idempotent and READ-ONLY: it scans the current register documents, computes
// how many are due-soon / overdue (bands 90/60/30/0/+30), and RETURNS the
// summary. It writes nothing and sends nothing — the MVP has no notification
// surface (due/overdue is already visible read-time in the register/detail).
// The entrypoint exists so the engine is in place; a live trigger (pg_cron /
// scheduled function / GH Actions cron) and what-it-does-on-fire (email/in-app)
// are separately-scoped later work.
//
// AUTH — accepts either:
//   • a shared secret header  `x-cron-secret: <GT_CRON_SECRET>`  (the live cron), or
//   • an authenticated ADMIN session (the in-app "Run review tick now" dev harness).
// Anything else gets 401/403.

import { json }                 from '@sveltejs/kit';
import { createClient }         from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }  from '$env/static/public';
import { env }                  from '$env/dynamic/private';
import { requireAdmin }         from '$lib/server/requireAuth';
import { computeReviewTick }    from '$lib/apps/golden_thread/utils/gtReview';
import { getLogger }            from '$lib/utils/logger';

const logger = getLogger('gt-review-tick');

/** Today as an ISO date (YYYY-MM-DD), en-GB-safe (no locale parsing). */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  // 1. Authorise: cron secret first, else an admin session.
  const secret = request.headers.get('x-cron-secret');
  const cronOk = !!env.GT_CRON_SECRET && secret === env.GT_CRON_SECRET;

  if (!cronOk) {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
  }

  // 2. Read-only scan of current documents (service role — no caller RLS needed).
  const supabase = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');
  const { data, error } = await supabase
    .from('gt_documents')
    .select('id, reference, status, review_due')
    .eq('status', 'current');

  if (error) {
    logger('review-tick query failed:', error.message);
    return json({ error: 'Failed to read register' }, { status: 500 });
  }

  const summary = computeReviewTick(data ?? [], todayISO());
  return json({ ranAt: new Date().toISOString(), ...summary });
}
