// src/routes/api/admin/reset-password/+server.js

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { logPasswordReset } from '$lib/server/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('ResetPasswordAPI');

export async function POST({ request }) {
  try {
    const { user_id, new_password, requesting_user_id } = await request.json();

    logger('Password reset request for:', user_id, 'by:', requesting_user_id);

    // Validate input
    if (!user_id || !new_password) {
      logger('❌ Missing user_id or new_password');
      return json(
        { error: 'User ID and new password are required' },
        { status: 400 }
      );
    }

    if (!requesting_user_id) {
      logger('❌ Missing requesting_user_id');
      return json(
        { error: 'Requesting user ID is required' },
        { status: 400 }
      );
    }

    if (new_password.length < 6) {
      logger('❌ Password too short');
      return json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify requesting user is admin
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, email')
      .eq('id', requesting_user_id)
      .single();

    if (!adminProfile?.is_admin) {
      logger('❌ Unauthorized - user is not admin');
      return json(
        { error: 'Unauthorized - admin access required' },
        { status: 403 }
      );
    }

    logger('✅ Admin verified');

    // Get target user email for audit log
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', user_id)
      .single();

    if (!targetProfile) {
      logger('❌ User not found:', user_id);
      return json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    logger('Resetting password for:', targetProfile.email);

    // Update user password using admin API
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    );

    if (error) {
      logger('❌ Password reset error:', error.message);
      return json(
        { error: error.message || 'Failed to reset password' },
        { status: 500 }
      );
    }

    logger('✅ Password reset successful');

    // Log password reset
    await logPasswordReset(
      requesting_user_id,
      adminProfile.email,
      user_id,
      targetProfile.email
    );

    logger('✅ Password reset logged to audit trail');

    return json({
      success: true,
      message: 'Password reset successfully',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });

  } catch (err) {
    logger('❌ Server error:', err.message);
    return json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
