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
import { PUBLIC_SUPABASE_URL }        from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY }  from '$env/static/private';
import { getLogger }                  from '$lib/utils/logger';

const logger = getLogger('RequireAuth');

const adminClient = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
