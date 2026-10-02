// src/lib/utils/authHeaders.js
// Bearer-token headers for authenticated portal API endpoints
// (/api/admin/*, /api/management/suggest-*, /api/audit/log, …).
// The server verifies the token with requireAuth / requireAdmin — caller
// identity always travels in the Authorization header, never in the body.

import { supabase } from '$lib/supabaseClient';

/**
 * The current session's access token, or null when there is none — the ONE
 * place the browser reads it (2026-10-02). Every caller that sends it to our
 * own API goes through here or through authHeaders(); `authTokenGuard.test.js`
 * fails a file that reads the session for a token by hand.
 * @returns {Promise<string|null>}
 */
export async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Build fetch headers carrying the current session's access token.
 * @throws {Error} when there is no active session.
 * @returns {Promise<{ 'Content-Type': string, 'Authorization': string }>}
 */
export async function authHeaders() {
  const token = await accessToken();
  if (!token) {
    // (A temporary console.info stood here to trace unexpected sign-outs,
    // beside an event trace in the auth store. That trace was removed on
    // 2026-07-11 — the sign-out was never reproduced — and this half was
    // missed until 2026-10-02.)
    throw new Error('Not authenticated');
  }
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token}`
  };
}
