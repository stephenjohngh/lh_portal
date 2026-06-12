// src/routes/api/admin/reset-password/+server.js

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/requireAuth';
import { logPasswordReset } from '$lib/server/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('ResetPasswordAPI');

export async function POST({ request }) {
  try {
    // Caller identity comes from the verified bearer token — never from the
    // request body (a body-supplied id is spoofable by anyone who knows it).
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const adminId    = auth.user.id;
    const adminEmail = auth.user.email;

    const { user_id, new_password } = await request.json();

    logger('Password reset request for:', user_id, 'by:', adminEmail);

    // Validate input
    if (!user_id || !new_password) {
      logger('❌ Missing user_id or new_password');
      return json(
        { error: 'User ID and new password are required' },
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
      adminId,
      adminEmail,
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
