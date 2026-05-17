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

      supabase.auth.onAuthStateChange((event, session) => {
        // TOKEN_REFRESHED only rotates the JWT — the user identity is unchanged.
        // Updating the store on that event causes reactive statements in +page.svelte
        // to re-run loadUserPermissions() every ~60 min, which the user sees as a reload.
        if (event === 'TOKEN_REFRESHED') return;
        set({ user: session?.user ?? null, loading: false });
      });
    },
    
    // Login flows through /api/auth/login (NOT supabase.auth directly).
    // The server route enforces per-email rate limiting and writes the
    // audit log (logLogin / logFailedLogin); this client just forwards
    // the credentials, hydrates the local Supabase client with the
    // returned session, and surfaces the result. See CLAUDE.md
    // "Auth — server-routed login" for the design note.
    login: async (email, password) => {
      try {
        logger('Login attempt for:', email);

        const res  = await fetch('/api/auth/login', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, password }),
        });
        const body = await res.json();

        if (!res.ok) {
          logger('❌ Login failed:', body.error);
          return {
            success:           false,
            error:             body.error ?? 'Login failed',
            locked:            !!body.locked,
            attemptsRemaining: body.attemptsRemaining,
          };
        }

        // Hydrate the local Supabase client with the session returned by
        // the server so subscriptions, realtime, and any direct supabase
        // calls (storage, auth) see the user. onAuthStateChange in
        // initialize() picks up the change and updates the store.
        await supabase.auth.setSession({
          access_token:  body.session.access_token,
          refresh_token: body.session.refresh_token,
        });

        logger('✅ Login successful:', email);
        return { success: true, data: body };
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

        // Log logout — fire-and-forget, do not block the redirect
        if (userId && userEmail) {
          fetch('/api/audit/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              userEmail,
              eventType:  'logout',
              targetType: 'user',
              targetId:   userId,
              targetName: userEmail,
              metadata:   { logout_type: 'user_initiated' }
            })
          }).catch(err => logger('Failed to log logout:', err.message));
        }

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
