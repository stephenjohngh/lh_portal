// src/routes/api/admin/delete-user/+server.js

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { getLogger } from '$lib/utils/logger';
import { logDelete } from '$lib/server/auditLogger';

const logger = getLogger('DeleteUserAPI');

export async function POST({ request }) {
  try {
    const { user_id, requesting_user_id } = await request.json();

    logger('Delete user request for:', user_id, 'by:', requesting_user_id);

    if (!user_id || !requesting_user_id) {
      logger('❌ Missing user_id or requesting_user_id');
      return json(
        { error: 'User ID and requesting user ID are required' },
        { status: 400 }
      );
    }

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
    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, email')
      .eq('id', requesting_user_id)
      .single();

    if (profileError || !adminProfile?.is_admin) {
      logger('❌ Unauthorized - user is not admin');
      return json(
        { error: 'Unauthorized - admin access required' },
        { status: 403 }
      );
    }

    // Prevent self-deletion
    if (user_id === requesting_user_id) {
      logger('❌ Prevented self-deletion attempt');
      return json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Get user details before deletion for audit log
    const { data: userToDelete } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name, is_admin, created_at')
      .eq('id', user_id)
      .single();

    if (!userToDelete) {
      logger('❌ User not found:', user_id);
      return json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    logger('Deleting user:', userToDelete.email);

    // Delete profile FIRST
    logger('Deleting profile and app_permissions');
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', user_id);

    if (profileDeleteError) {
      logger('❌ Profile delete error:', profileDeleteError.message);
      return json(
        { error: `Database error deleting user: ${profileDeleteError.message}` },
        { status: 500 }
      );
    }

    logger('✅ Profile deleted successfully');

    // Delete from auth
    logger('Deleting auth user');
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
      user_id
    );

    if (authDeleteError) {
      logger('⚠️ Auth delete error:', authDeleteError.message);
      logger('Warning: Profile deleted but auth deletion failed');
    } else {
      logger('✅ Auth user deleted successfully');
    }

    // Log user deletion
    await logDelete(
      requesting_user_id,
      adminProfile.email,
      'user',
      user_id,
      userToDelete.email,
      {
        email: userToDelete.email,
        full_name: userToDelete.full_name,
        is_admin: userToDelete.is_admin,
        created_at: userToDelete.created_at
      },
      {
        deleted_by_admin: true
      }
    );

    logger('✅ User deletion logged to audit trail');
    logger('✅ User deletion completed for:', userToDelete.email);

    return json({
      success: true,
      message: 'User deleted successfully',
      user: {
        id: user_id,
        email: userToDelete.email,
        full_name: userToDelete.full_name
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
