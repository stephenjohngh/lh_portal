// src/routes/api/admin/reset-password/+server.js
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export async function POST({ request }) {
  try {
    const { user_id, new_password } = await request.json();

    console.log('📝 Admin password reset request');
    console.log('   User ID:', user_id);

    // Validate input
    if (!user_id || !new_password) {
      return json(
        { error: 'User ID and new password are required' },
        { status: 400 }
      );
    }

	  //no length check
    if (new_password.length < 0) {
      return json(
        { error: 'Password must be at least 8 characters' },
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
