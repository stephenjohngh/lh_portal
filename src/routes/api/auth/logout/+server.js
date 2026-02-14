// src/routes/api/auth/logout/+server.js
// Complete logout endpoint with audit logging
// READY TO DEPLOY - Just copy to your project

import { json } from '@sveltejs/kit';
import { logLogout } from '$lib/server/auditLogger';

export async function POST({ request, locals }) {
  try {
    // Get current session
    const { data: { session } } = await locals.supabase.auth.getSession();
    
    if (!session?.user) {
      return json({ error: 'Not logged in' }, { status: 401 });
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    console.log('🔓 Logout request from:', userEmail);

    // Sign out
    const { error } = await locals.supabase.auth.signOut();

    if (error) {
      console.log('❌ Logout failed:', error);
      return json({ error: error.message }, { status: 400 });
    }

    console.log('✅ Logout successful:', userEmail);

    // ✨ LOG LOGOUT EVENT
    await logLogout(
      userId,
      userEmail,
      {
        logout_type: 'user_initiated',
        logged_out_at: new Date().toISOString()
      }
    );

    return json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (err) {
    console.error('Logout error:', err);
    return json({ error: 'An error occurred during logout' }, { status: 500 });
  }
}
