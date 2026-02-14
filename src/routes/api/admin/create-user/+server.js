// src/routes/api/admin/create-user/+server.js
// UPDATED: Added audit logging for user creation

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { logCreate } from '$lib/server/auditLogger';

const supabaseAdmin = createClient(
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

export async function POST({ request }) {
  console.log('\n=== CREATE USER REQUEST RECEIVED ===');
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    const body = await request.json();
    const { email, password, full_name, requesting_user_id } = body;
    
    console.log('Create user request for:', email);

    if (!requesting_user_id) {
      console.log('❌ No requesting_user_id provided');
      return json({ error: 'No user ID provided' }, { status: 400 });
    }

    // Check if requesting user is admin
    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, email')
      .eq('id', requesting_user_id)
      .single();

    if (profileError || !adminProfile) {
      console.error('❌ Profile lookup error:', profileError);
      return json({ error: 'Could not verify admin status' }, { status: 500 });
    }

    if (!adminProfile.is_admin) {
      console.log('❌ User is NOT admin');
      return json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    console.log('✅ User is admin! Proceeding with user creation...');

    // Validate input
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Create new user
    console.log('Creating user with email:', email);
    
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || '' }
    });

    if (createError) {
      console.error('❌ Create user error:', createError);
      
      // ✨ LOG FAILED USER CREATION
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

    console.log('✅ User created successfully! ID:', newUser.user.id);

    // Update profile with full_name if provided
    if (full_name) {
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ full_name })
        .eq('id', newUser.user.id);
      
      if (updateError) {
        console.log('⚠️ Warning: Could not update profile:', updateError.message);
      }
    }

    // ✨ LOG SUCCESSFUL USER CREATION
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

    console.log('✅ User creation logged to audit trail');
    
    return json({ 
      success: true, 
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        full_name
      }
    });

  } catch (err) {
    console.error('=== UNEXPECTED ERROR ===', err);
    return json({ error: 'Internal server error', message: err.message }, { status: 500 });
  }
}
