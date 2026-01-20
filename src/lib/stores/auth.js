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
    login: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) return { success: false, error: error.message };
      return { success: true, data };
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
    logout: async () => {
      await supabase.auth.signOut();
    }
  };
}

export const auth = createAuthStore();
