// src/lib/utils/authHeaders.js
// Bearer-token headers for authenticated portal API endpoints
// (/api/admin/*, /api/management/suggest-*, /api/audit/log, …).
// The server verifies the token with requireAuth / requireAdmin — caller
// identity always travels in the Authorization header, never in the body.

import { supabase } from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('authHeaders');

/**
 * Build fetch headers carrying the current session's access token.
 * @throws {Error} when there is no active session.
 * @returns {Promise<{ 'Content-Type': string, 'Authorization': string }>}
 */
export async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    // DIAGNOSTIC (temporary): getSession() returned no session at request time —
    // this is the exact point an authed call (AI / admin) fails. Correlate the
    // timestamp with the authStore event trace. Remove once cause is identified.
    logger(`🔐 no session at request time — [${new Date().toISOString()}]`);
    throw new Error('Not authenticated');
  }
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${session.access_token}`
  };
}
