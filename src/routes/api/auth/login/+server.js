// src/routes/api/auth/login/+server.js
// Complete login endpoint with audit logging and brute force protection
// READY TO DEPLOY - Just copy to your project

import { json } from '@sveltejs/kit';
import { logLogin, logFailedLogin } from '$lib/server/auditLogger';

// Brute force protection
const failedLoginAttempts = new Map(); // email -> { count, firstAttempt }
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

export async function POST({ request, locals }) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return json({ error: 'Email and password required' }, { status: 400 });
    }

    console.log('🔐 Login attempt for:', email);

    // Check if account is locked due to failed attempts
    const attempts = failedLoginAttempts.get(email.toLowerCase());
    if (attempts) {
      const timeSinceFirst = Date.now() - attempts.firstAttempt;
      
      if (attempts.count >= MAX_FAILED_ATTEMPTS && timeSinceFirst < LOCKOUT_DURATION) {
        console.log('🚨 Account locked due to failed attempts:', email);
        
        // ✨ LOG ACCOUNT LOCKOUT
        await logFailedLogin(
          email,
          request,
          'account_locked_too_many_attempts'
        );

        return json({ 
          error: 'Too many failed attempts. Please try again in 15 minutes.',
          locked: true
        }, { status: 429 });
      }
      
      // Reset if lockout period has passed
      if (timeSinceFirst >= LOCKOUT_DURATION) {
        failedLoginAttempts.delete(email.toLowerCase());
      }
    }

    // Attempt login
    const { data, error } = await locals.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.log('❌ Login failed:', email, error.message);
      
      // Track failed attempt
      const emailLower = email.toLowerCase();
      const current = failedLoginAttempts.get(emailLower) || { 
        count: 0, 
        firstAttempt: Date.now() 
      };
      current.count++;
      failedLoginAttempts.set(emailLower, current);

      console.log(`Failed login attempts for ${email}: ${current.count}/${MAX_FAILED_ATTEMPTS}`);
      
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

    // Successful login - clear failed attempts
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
        provider: data.user.app_metadata?.provider || 'email',
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

// Cleanup old failed attempts periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [email, attempts] of failedLoginAttempts.entries()) {
    const timeSinceFirst = now - attempts.firstAttempt;
    if (timeSinceFirst >= LOCKOUT_DURATION) {
      failedLoginAttempts.delete(email);
      console.log('🧹 Cleaned up expired failed attempts for:', email);
    }
  }
}, 5 * 60 * 1000);
