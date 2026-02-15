// src/lib/stores/auth.js
// CLEANED: All console.log/console.error replaced with getLogger

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('authStore');

function createAuthStore() {
  const { subscribe, set, update } = writable({
    user: null,
    loading: true
  });

  return {
    subscribe,
    initialize: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      set({ user: session?.user ?? null, loading: false });

      supabase.auth.onAuthStateChange((_event, session) => {
        set({ user: session?.user ?? null, loading: false });
      });
    },
    
    login: async (email, password) => {
      try {
        logger('Login attempt for:', email);
        
        // Login via Supabase (original way - this works!)
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (error) {
          logger('❌ Login failed:', error.message);
          
          // Log failed login
          fetch('/api/audit/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'failed_login',
              targetType: 'user',
              targetId: null,
              targetName: email,
              metadata: {
                reason: error.message,
                ip: null
              }
            })
          }).catch(err => logger('Failed to log failed login:', err.message));
          
          return { success: false, error: error.message };
        }

        logger('✅ Login successful:', email);

        // Log successful login
        fetch('/api/audit/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: data.user.id,
            userEmail: data.user.email,
            eventType: 'login',
            targetType: 'user',
            targetId: data.user.id,
            targetName: data.user.email,
            metadata: {
              provider: 'email',
              session_id: data.session.access_token.substring(0, 20)
            }
          })
        }).catch(err => logger('Failed to log login:', err.message));

        return { success: true, data };
      } catch (error) {
        logger('❌ Login exception:', error.message);
        return { success: false, error: error.message };
      }
    },
    
    signup: async (email, password, fullName) => {
      try {
        logger('Signup attempt for:', email);
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName }
          }
        });
        
        if (error) {
          logger('❌ Signup failed:', error.message);
          return { success: false, error: error.message };
        }
        
        logger('✅ Signup successful:', email);
        return { success: true, data };
      } catch (error) {
        logger('❌ Signup exception:', error.message);
        return { success: false, error: error.message };
      }
    },
    
    logout: async () => {
      try {
        // Get user info BEFORE logging out
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        const userEmail = session?.user?.email;

        logger('Logout request for:', userEmail);

        // Sign out from Supabase FIRST
        const { error } = await supabase.auth.signOut();
        
        if (error) {
          logger('❌ Logout error:', error.message);
        }

        // Clear local state immediately
        set({ user: null, loading: false });

        // Log logout - WAIT for it to complete before redirecting
        if (userId && userEmail) {
          try {
            await fetch('/api/audit/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: userId,
                userEmail: userEmail,
                eventType: 'logout',
                targetType: 'user',
                targetId: userId,
                targetName: userEmail,
                metadata: {
                  logout_type: 'user_initiated'
                }
              })
            });
            logger('✅ Logout logged successfully');
          } catch (logError) {
            logger('Failed to log logout:', logError.message);
            // Continue with logout even if logging fails
          }
        }

        // Now redirect (after logging completes)
        window.location.href = '/login';

        return { success: true };
      } catch (error) {
        logger('❌ Logout exception:', error.message);
        // Force clear even on error
        set({ user: null, loading: false });
        window.location.href = '/login';
        return { success: false, error: error.message };
      }
    }
  };
}

export const auth = createAuthStore();
