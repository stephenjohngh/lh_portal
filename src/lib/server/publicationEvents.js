// src/lib/server/publicationEvents.js
// The access log of a published pack: who (by address) opened which link, when,
// and which files they took. Written from the PUBLIC reader routes, with the
// service role, after the request has been decided — it never changes the answer.
//
// ⛔ Recording must never break or slow reading: every failure is swallowed and
// logged. A recipient must not lose a pack because a log row could not be written.
//
// ⛔ Events are shown only to the pack's owner and admins (RLS on the table) and are
// removed only with their publication (ON DELETE CASCADE).
//
// A page open is recorded at most once per address per publication in
// OPEN_QUIET_MINUTES, so a reload (or a phone waking the tab) is not counted as a
// new visit. Everything else is recorded each time.

import { createClient }          from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }   from '$app/env/public';
import * as env                  from '$app/env/private';
import { getClientIp }           from '#lib/server/publicRateLimit.js';
import { getLogger }             from '#lib/utils/logger.js';

const logger = getLogger('publicationEvents');

export const OPEN_QUIET_MINUTES = 5;

let _svc = null;
function svc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  return _svc;
}

/**
 * @param {Request} request
 * @param {string} publicationId
 * @param {'opened'|'unlock_ok'|'unlock_failed'|'file'|'refused_revoked'|'refused_expired'} event
 * @param {{ documentId?: string, filename?: string }} [extra]
 * @returns {Promise<void>}  never rejects
 */
export async function recordPublicationEvent(request, publicationId, event, extra = {}) {
  try {
    if (!publicationId) return;
    const ip = getClientIp(request);
    const db = svc();

    if (event === 'opened') {
      const since = new Date(Date.now() - OPEN_QUIET_MINUTES * 60 * 1000).toISOString();
      const { count } = await db.from('dossier_publication_events')
        .select('id', { count: 'exact', head: true })
        .eq('publication_id', publicationId).eq('event', 'opened').eq('ip', ip)
        .gte('created_at', since);
      if ((count ?? 0) > 0) return;
    }

    const { error } = await db.from('dossier_publication_events').insert({
      publication_id: publicationId,
      event,
      ip,
      user_agent:  (request.headers.get('user-agent') ?? '').slice(0, 300) || null,
      document_id: extra.documentId ?? null,
      filename:    extra.filename ? String(extra.filename).slice(0, 300) : null,
    });
    if (error) logger('⚠ access event not recorded:', event, error.message);
  } catch (/** @type {any} */ err) {
    logger('⚠ access event failed:', event, err?.message);
  }
}
