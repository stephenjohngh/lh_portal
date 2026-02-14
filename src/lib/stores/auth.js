// src/lib/stores/auth.js
// FIXED: Keep original Supabase login (so apps work), just add logging

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';

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
    
    // ✨ FIXED: Use Supabase directly (so apps work), then log
    login: async (email, password) => {
      try {
        // Login via Supabase (original way - this works!)
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (error) {
          // ✨ LOG FAILED LOGIN
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
          }).catch(err => console.error('Failed to log failed login:', err));
          
          return { success: false, error: error.message };
        }

        // ✨ LOG SUCCESSFUL LOGIN
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
        }).catch(err => console.error('Failed to log login:', err));

        return { success: true, data };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    
    signup: async (email, password, fullName) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName }
        }
      });
      
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    },
    
    // ✨ FIXED: Wait for logging before redirecting
    logout: async () => {
      try {
        // Get user info BEFORE logging out
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        const userEmail = session?.user?.email;

        // Sign out from Supabase FIRST
        const { error } = await supabase.auth.signOut();
        
        if (error) {
          console.error('Logout error:', error);
        }

        // Clear local state immediately
        set({ user: null, loading: false });

        // ✨ LOG LOGOUT - WAIT for it to complete before redirecting
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
            console.log('✅ Logout logged successfully');
          } catch (logError) {
            console.error('Failed to log logout:', logError);
            // Continue with logout even if logging fails
          }
        }

        // Now redirect (after logging completes)
        window.location.href = '/login';

        return { success: true };
      } catch (error) {
        console.error('Logout error:', error);
        // Force clear even on error
        set({ user: null, loading: false });
        window.location.href = '/login';
        return { success: false, error: error.message };
      }
    }
  };
}

export const auth = createAuthStore();
