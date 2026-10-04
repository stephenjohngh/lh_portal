// src/lib/server/requireAuth.js
// Shared auth helpers for API routes. Verifies the caller's Supabase access
// token (sent in the Authorization header) and optionally checks admin status.
//
// Pattern in routes:
//   const auth = await requireAuth(request);
//   if (auth.error) return auth.error;       // 401 / 403 already formatted
//   const userId = auth.user.id;
//
// For admin-only routes:
//   const auth = await requireAdmin(request);
//   if (auth.error) return auth.error;

import { json }                       from '@sveltejs/kit';
import { createClient }               from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import * as env from '$app/env/private';
import { getLogger }                  from '#lib/utils/logger.js';

const logger = getLogger('RequireAuth');

const adminClient = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');

/**
 * Verify the caller's Supabase access token from the Authorization header.
 *
 * @param {Request} request
 * @returns {Promise<{ user: { id: string, email: string }, isAdmin: boolean, error: null }
 *                 | { user: null, isAdmin: false, error: Response }>}
 */
export async function requireAuth(request) {
  const header = request.headers.get('authorization') ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return { user: null, isAdmin: false, error: json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user) {
    logger('Token verification failed:', error?.message ?? 'no user');
    return { user: null, isAdmin: false, error: json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .single();

  return {
    user:    { id: data.user.id, email: data.user.email },
    isAdmin: profile?.is_admin === true,
    error:   null,
  };
}

/**
 * Verify the caller is an admin. Returns the same shape as requireAuth() but
 * with a 403 error response if the user is authenticated but not admin.
 *
 * @param {Request} request
 */
export async function requireAdmin(request) {
  const auth = await requireAuth(request);
  if (auth.error)   return auth;
  if (!auth.isAdmin) {
    return { user: null, isAdmin: false, error: json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return auth;
}

/**
 * requireAuth, plus the caller must hold `appId` in app_permissions (a
 * read-only grant counts) — or be an admin, who bypasses grants everywhere.
 *
 * For a route that reads an app's data with the SERVICE ROLE: RLS no longer
 * guards that read, so the route must ask the question the table would have.
 * Added in the security review (2026-09-27) for the MOR routes, which read
 * `mor_cases` — a table whose own RLS requires the MOR grant — and checked
 * nothing but a login.
 *
 * @param {Request} request
 * @param {string} appId
 */
export async function requireAppAccess(request, appId) {
  const auth = await requireAuth(request);
  if (auth.error || auth.isAdmin) return auth;
  const { data, error } = await adminClient
    .from('app_permissions')
    .select('app_id')
    .eq('user_id', auth.user.id)
    .eq('app_id', appId)
    .maybeSingle();
  if (error || !data) {
    return { user: null, isAdmin: false, error: json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return auth;
}
