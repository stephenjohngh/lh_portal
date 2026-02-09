// src/lib/stores/permissions.js
// Permission management store with per-app read-only support

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';

function createPermissionsStore() {
  const { subscribe, set, update } = writable({
    loading: true,
    isAdmin: false,
    canModify: true, // Default for current app
    appPermissions: {}, // { appId: { hasAccess: bool, isReadOnly: bool } }
    userId: null
  });

  return {
    subscribe,
    
    /**
     * Initialize permissions for the current user
     * @param {string} userId - Current user ID
     * @param {string} currentApp - Current app ID (e.g., 'issues', 'users')
     */
    async init(userId, currentApp = 'issues') {
      if (!userId) {
        set({
          loading: false,
          isAdmin: false,
          canModify: false,
          appPermissions: {},
          userId: null
        });
        return;
      }

      try {
        // Get user profile to check admin status
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', userId)
          .single();

        if (profileError) throw profileError;

        const isAdmin = profile?.is_admin || false;

        // Get all app permissions for this user
        const { data: permissions, error: permError } = await supabase
          .from('app_permissions')
          .select('app_id, is_read_only')
          .eq('user_id', userId);

        if (permError) throw permError;

        // Build app permissions map
        const appPermissions = {};
        (permissions || []).forEach(perm => {
          appPermissions[perm.app_id] = {
            hasAccess: true,
            isReadOnly: perm.is_read_only || false
          };
        });

        // Determine canModify for current app
        const currentAppPerm = appPermissions[currentApp];
        const canModify = isAdmin || (currentAppPerm?.hasAccess && !currentAppPerm?.isReadOnly);

        set({
          loading: false,
          isAdmin,
          canModify,
          appPermissions,
          userId
        });

        console.log('✅ Permissions initialized:', {
          isAdmin,
          currentApp,
          canModify,
          appCount: Object.keys(appPermissions).length
        });

      } catch (error) {
        console.error('❌ Error initializing permissions:', error);
        set({
          loading: false,
          isAdmin: false,
          canModify: false,
          appPermissions: {},
          userId
        });
      }
    },

    /**
     * Check if user can modify in a specific app
     * @param {string} appId - App ID to check
     * @returns {boolean}
     */
    canModifyApp(appId) {
      let result = false;
      update(state => {
        if (state.isAdmin) {
          result = true;
        } else {
          const appPerm = state.appPermissions[appId];
          result = appPerm?.hasAccess && !appPerm?.isReadOnly;
        }
        return state;
      });
      return result;
    },

    /**
     * Check if user has access to an app
     * @param {string} appId - App ID to check
     * @returns {boolean}
     */
    hasAppAccess(appId) {
      let result = false;
      update(state => {
        if (state.isAdmin) {
          result = true;
        } else {
          result = state.appPermissions[appId]?.hasAccess || false;
        }
        return state;
      });
      return result;
    },

    /**
     * Refresh permissions (call after permission changes)
     * @param {string} currentApp - Current app ID
     */
    async refresh(currentApp = 'issues') {
      let userId = null;
      update(state => {
        userId = state.userId;
        return { ...state, loading: true };
      });
      
      if (userId) {
        await this.init(userId, currentApp);
      }
    },

    /**
     * Clear permissions (on logout)
     */
    clear() {
      set({
        loading: false,
        isAdmin: false,
        canModify: false,
        appPermissions: {},
        userId: null
      });
    }
  };
}

export const permissions = createPermissionsStore();
