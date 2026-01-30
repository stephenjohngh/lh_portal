// src/routes/api/admin/create-user/+server.js
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

console.log('=== SERVER ENDPOINT LOADED ===');
console.log('PUBLIC_SUPABASE_URL:', PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY + ' ✅ Set (length: ' + SUPABASE_SERVICE_ROLE_KEY?.length + ')' : '❌ Missing');

const supabaseAdmin = createClient(
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

console.log('Supabase admin client created');

export async function POST({ request }) {
  console.log('\n=== CREATE USER REQUEST RECEIVED ===');
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    // Parse request body
    const body = await request.json();
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    const { email, password, full_name, requesting_user_id } = body;
    
    console.log('Extracted values:');
    console.log('  - email:', email);
    console.log('  - password:', password ? '***' + password.slice(-3) : 'missing');
    console.log('  - full_name:', full_name || '(not provided)');
    console.log('  - requesting_user_id:', requesting_user_id);

    // Validate requesting_user_id exists
    if (!requesting_user_id) {
      console.log('❌ No requesting_user_id provided');
      return json({ error: 'No user ID provided' }, { status: 400 });
    }

    // Step 1: Check if requesting user is admin
    console.log('\n--- STEP 1: Checking if user is admin ---');
    console.log('Querying profiles table for user:', requesting_user_id);
    
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', requesting_user_id)
      .single();

    console.log('Profile query result:');
    console.log('  - profile:', profile);
    console.log('  - error:', profileError);

    if (profileError) {
      console.error('❌ Profile lookup error:', profileError);
      return json({ 
        error: 'Could not verify admin status', 
        details: profileError.message,
        code: profileError.code
      }, { status: 500 });
    }

    if (!profile) {
      console.log('❌ No profile found for user:', requesting_user_id);
      return json({ error: 'User profile not found' }, { status: 404 });
    }

    console.log('Profile found:', profile);
    console.log('is_admin value:', profile.is_admin);
    console.log('is_admin type:', typeof profile.is_admin);

    if (!profile.is_admin) {
      console.log('❌ User is NOT admin');
      console.log('   Expected is_admin: true');
      console.log('   Got is_admin:', profile.is_admin);
      return json({ 
        error: 'Unauthorized: Admin access required',
        debug_info: {
          user_id: requesting_user_id,
          is_admin: profile.is_admin,
          profile: profile
        }
      }, { status: 403 });
    }

    console.log('✅ User is admin! Proceeding with user creation...');

    // Step 2: Validate input
    console.log('\n--- STEP 2: Validating input ---');
    if (!email || !password) {
      console.log('❌ Missing email or password');
      console.log('   email:', email ? 'provided' : 'missing');
      console.log('   password:', password ? 'provided' : 'missing');
      return json({ error: 'Email and password are required' }, { status: 400 });
    }
    console.log('✅ Email and password provided');

    // Step 3: Create new user
    console.log('\n--- STEP 3: Creating new user ---');
    console.log('Creating user with email:', email);
    
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || '' }
    });

    console.log('Create user result:');
    console.log('  - newUser:', newUser ? 'created' : 'failed');
    console.log('  - error:', createError);

    if (createError) {
      console.error('❌ Create user error:', createError);
      return json({ 
        error: createError.message,
        code: createError.code,
        status: createError.status
      }, { status: 400 });
    }

    console.log('✅ User created successfully!');
    console.log('   User ID:', newUser.user.id);
    console.log('   Email:', newUser.user.email);

    // Step 4: Update profile with full_name if provided
    if (full_name) {
      console.log('\n--- STEP 4: Updating profile with full_name ---');
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ full_name })
        .eq('id', newUser.user.id);
      
      if (updateError) {
        console.log('⚠️ Warning: Could not update profile:', updateError.message);
      } else {
        console.log('✅ Profile updated with full_name:', full_name);
      }
    }

    console.log('\n=== SUCCESS ===');
    const result = { 
      success: true, 
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        full_name
      }
    };
    console.log('Returning:', result);
    
    return json(result);

  } catch (err) {
    console.error('\n=== UNEXPECTED ERROR ===');
    console.error('Error type:', err.constructor.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    return json({ 
      error: 'Internal server error',
      message: err.message,
      type: err.constructor.name
    }, { status: 500 });
  }
}
