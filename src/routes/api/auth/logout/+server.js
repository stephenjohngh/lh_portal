// src/routes/api/auth/logout/+server.js
// FIXED: Now uses direct Supabase client like your other endpoints

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { logLogout } from '$lib/server/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('AuthLogout');

// Create Supabase client (matches your existing endpoint pattern)
const supabase = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST({ request }) {
  try {
    // Get user_id from request body (passed from client)
    const { user_id, user_email } = await request.json();
    
    if (!user_id || !user_email) {
      return json({ error: 'User information required' }, { status: 400 });
    }

    logger('🔓 Logout request from:', user_email);

    // ✨ LOG LOGOUT EVENT
    await logLogout(
      user_id,
      user_email,
      {
        logout_type: 'user_initiated',
        logged_out_at: new Date().toISOString()
      }
    );

    logger('✅ Logout logged successfully');

    return json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (err) {
    logger('❌ Logout error:', err.message);
    return json({ error: 'An error occurred during logout' }, { status: 500 });
  }
}
