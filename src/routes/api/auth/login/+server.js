// src/routes/api/auth/login/+server.js
// FIXED: Now uses direct Supabase client like your other endpoints

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { logLogin, logFailedLogin } from '$lib/server/auditLogger';

// Create Supabase client (matches your existing endpoint pattern)
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Brute force protection
const failedLoginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

export async function POST({ request }) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return json({ error: 'Email and password required' }, { status: 400 });
    }

    console.log('🔐 Login attempt for:', email);

    // Check if account is locked
    const attempts = failedLoginAttempts.get(email.toLowerCase());
    if (attempts) {
      const timeSinceFirst = Date.now() - attempts.firstAttempt;
      
      if (attempts.count >= MAX_FAILED_ATTEMPTS && timeSinceFirst < LOCKOUT_DURATION) {
        console.log('🚨 Account locked:', email);
        
        await logFailedLogin(email, request, 'account_locked_too_many_attempts');

        return json({ 
          error: 'Too many failed attempts. Please try again in 15 minutes.',
          locked: true
        }, { status: 429 });
      }
      
      if (timeSinceFirst >= LOCKOUT_DURATION) {
        failedLoginAttempts.delete(email.toLowerCase());
      }
    }

    // Attempt login
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.log('❌ Login failed:', email);
      
      // Track failed attempt
      const emailLower = email.toLowerCase();
      const current = failedLoginAttempts.get(emailLower) || { 
        count: 0, 
        firstAttempt: Date.now() 
      };
      current.count++;
      failedLoginAttempts.set(emailLower, current);
      
      // ✨ LOG FAILED LOGIN
      await logFailedLogin(
        email,
        request,
        `${error.message} (attempt ${current.count}/${MAX_FAILED_ATTEMPTS})`
      );

      return json({ 
        error: 'Invalid email or password',
        attemptsRemaining: MAX_FAILED_ATTEMPTS - current.count
      }, { status: 401 });
    }

    // Success
    const previousFailedAttempts = attempts?.count || 0;
    failedLoginAttempts.delete(email.toLowerCase());

    console.log('✅ Login successful:', email);

    // ✨ LOG SUCCESSFUL LOGIN
    await logLogin(
      data.user.id,
      data.user.email,
      request,
      {
        session_id: data.session.access_token.substring(0, 20),
        provider: 'email',
        previous_failed_attempts: previousFailedAttempts
      }
    );

    return json({
      success: true,
      user: data.user,
      session: data.session
    });

  } catch (err) {
    console.error('Login error:', err);
    return json({ error: 'An error occurred during login' }, { status: 500 });
  }
}
