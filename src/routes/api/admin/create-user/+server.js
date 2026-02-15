// src/routes/api/admin/create-user/+server.js
// CLEANED: All console.log replaced with logger

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { logCreate } from '$lib/server/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('CreateUserAPI');

const supabaseAdmin = createClient(
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

export async function POST({ request }) {
  try {
    const body = await request.json();
    const { email, password, full_name, requesting_user_id } = body;
    
    logger('Create user request for:', email, 'by:', requesting_user_id);

    if (!requesting_user_id) {
      logger('❌ No requesting_user_id provided');
      return json({ error: 'No user ID provided' }, { status: 400 });
    }

    // Check if requesting user is admin
    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, email')
      .eq('id', requesting_user_id)
      .single();

    if (profileError || !adminProfile) {
      logger('❌ Profile lookup error:', profileError?.message);
      return json({ error: 'Could not verify admin status' }, { status: 500 });
    }

    if (!adminProfile.is_admin) {
      logger('❌ User is not admin:', requesting_user_id);
      return json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    logger('✅ Admin verified, proceeding with user creation');

    // Validate input
    if (!email || !password) {
      logger('❌ Missing email or password');
      return json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Create new user
    logger('Creating user:', email);
    
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || '' }
    });

    if (createError) {
      logger('❌ Create user error:', createError.message);
      
      // Log failed user creation
      await logCreate(
        requesting_user_id,
        adminProfile.email,
        'user',
        null,
        email,
        {
          error: createError.message,
          attempted_email: email
        }
      );
      
      return json({ error: createError.message }, { status: 400 });
    }

    logger('✅ User created successfully:', newUser.user.id);

    // Update profile with full_name if provided
    if (full_name) {
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ full_name })
        .eq('id', newUser.user.id);
      
      if (updateError) {
        logger('⚠️ Could not update profile:', updateError.message);
      } else {
        logger('✅ Profile updated with full_name');
      }
    }

    // Log successful user creation
    await logCreate(
      requesting_user_id,
      adminProfile.email,
      'user',
      newUser.user.id,
      newUser.user.email,
      {
        email: newUser.user.email,
        full_name: full_name || null,
        is_admin: false
      }
    );

    logger('✅ User creation logged to audit trail');
    
    return json({ 
      success: true, 
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        full_name
      }
    });

  } catch (err) {
    logger('❌ Unexpected error:', err.message);
    return json({ error: 'Internal server error', message: err.message }, { status: 500 });
  }
}
