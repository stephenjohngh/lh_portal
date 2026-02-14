// src/routes/api/auth/logout/+server.js
// FIXED: Now uses direct Supabase client like your other endpoints

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { logLogout } from '$lib/server/auditLogger';

// Create Supabase client (matches your existing endpoint pattern)
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST({ request }) {
  try {
    // Get user_id from request body (passed from client)
    const { user_id, user_email } = await request.json();
    
    if (!user_id || !user_email) {
      return json({ error: 'User information required' }, { status: 400 });
    }

    console.log('🔓 Logout request from:', user_email);

    // ✨ LOG LOGOUT EVENT
    await logLogout(
      user_id,
      user_email,
      {
        logout_type: 'user_initiated',
        logged_out_at: new Date().toISOString()
      }
    );

    console.log('✅ Logout logged successfully');

    return json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (err) {
    console.error('Logout error:', err);
    return json({ error: 'An error occurred during logout' }, { status: 500 });
  }
}
