// src/routes/api/admin/reset-password/+server.js
// UPDATED: Added audit logging for password resets

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { logPasswordReset } from '$lib/server/auditLogger';

export async function POST({ request }) {
  try {
    const { user_id, new_password, requesting_user_id } = await request.json();

    console.log('📝 Admin password reset request');
    console.log('   Target user ID:', user_id);
    console.log('   Requesting user ID:', requesting_user_id);

    // Validate input
    if (!user_id || !new_password) {
      return json(
        { error: 'User ID and new password are required' },
        { status: 400 }
      );
    }

    if (!requesting_user_id) {
      return json(
        { error: 'Requesting user ID is required' },
        { status: 400 }
      );
    }

    if (new_password.length < 6) {
      return json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // ✨ Verify requesting user is admin
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, email')
      .eq('id', requesting_user_id)
      .single();

    if (!adminProfile?.is_admin) {
      console.log('❌ Unauthorized - user is not admin');
      return json(
        { error: 'Unauthorized - admin access required' },
        { status: 403 }
      );
    }

    // ✨ Get target user email for audit log
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', user_id)
      .single();

    if (!targetProfile) {
      return json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update user password using admin API
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    );

    if (error) {
      console.error('❌ Supabase admin error:', error);
      return json(
        { error: error.message || 'Failed to reset password' },
        { status: 500 }
      );
    }

    console.log('✅ Password reset successful for user:', user_id);

    // ✨ LOG PASSWORD RESET (uses pre-built function)
    await logPasswordReset(
      requesting_user_id,
      adminProfile.email,
      user_id,
      targetProfile.email
    );

    console.log('✅ Password reset logged to audit trail');

    return json({
      success: true,
      message: 'Password reset successfully',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });

  } catch (err) {
    console.error('❌ Server error:', err);
    return json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
