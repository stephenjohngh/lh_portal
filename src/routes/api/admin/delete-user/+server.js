// src/routes/api/admin/delete-user/+server.js
/**
 * Admin API endpoint to delete a user
 * Matches the pattern of reset-password endpoint
 */

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('DeleteUserAPI');

export async function POST({ request }) {
  try {
    const { user_id, requesting_user_id } = await request.json();

    logger('Delete user request');
    logger('Target user ID:', user_id);
    logger('Requesting user ID:', requesting_user_id);

    // Validate input
    if (!user_id || !requesting_user_id) {
      return json(
        { error: 'User ID and requesting user ID are required' },
        { status: 400 }
      );
    }

    // Create Supabase admin client with service role key
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

    // Verify requesting user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', requesting_user_id)
      .single();

    if (profileError || !profile?.is_admin) {
      logger('Unauthorized - user is not admin');
      return json(
        { error: 'Unauthorized - admin access required' },
        { status: 403 }
      );
    }

    // Prevent self-deletion
    if (user_id === requesting_user_id) {
      logger('Prevented self-deletion attempt');
      return json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Get user details before deletion (for logging and response)
    const { data: userToDelete } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('id', user_id)
      .single();

    if (!userToDelete) {
      logger('User not found:', user_id);
      return json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    logger('Deleting user:', userToDelete.email);

    // Step 1: Delete profile FIRST (before auth)
    // This way if it fails, we haven't orphaned the auth user
    logger('Deleting profile and app_permissions...');
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', user_id);

    if (profileDeleteError) {
      logger('Profile delete error:', profileDeleteError);
      logger('Error details:', JSON.stringify(profileDeleteError));
      return json(
        { error: `Database error deleting user: ${profileDeleteError.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    logger('Profile deleted successfully (app_permissions CASCADE deleted)');

    // Step 2: Delete from auth
    logger('Deleting auth user...');
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
      user_id
    );

    if (authDeleteError) {
      logger('Auth delete error:', authDeleteError);
      logger('Warning: Profile deleted but auth deletion failed');
      // We continue because profile is already deleted
      // User can't login anymore anyway (no profile = no access)
    } else {
      logger('Auth user deleted successfully');
    }

    logger('User deletion completed for:', userToDelete.email);

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
    logger('Server error:', err);
    logger('Error stack:', err.stack);
    return json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
