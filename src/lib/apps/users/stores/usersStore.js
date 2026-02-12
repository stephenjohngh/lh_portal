// src/lib/apps/users/stores/usersStore.js
/**
 * Users Store - Centralized state management for user operations
 * Handles all API calls and data management for the Users app
 */

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api } from '$lib/utils/api';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger("usersStore");

// Create stores
function createUsersStore() {
  const { subscribe, set, update } = writable({
    users: [],
    loading: false,
    error: null
  });

  // App permissions cache
  const appPermissions = writable({}); // { userId: ['app1', 'app2'] }
  const appReadOnly = writable({}); // { userId: { appId: boolean } }
  const loadingApps = writable({}); // { userId: boolean }

  return {
    subscribe,
    appPermissions,
    appReadOnly,
    loadingApps,

    /**
     * Fetch all users from database
     */
    async fetchUsers() {
      logger('Fetching users...');

      update(state => ({ ...state, loading: true, error: null }));

      try {
        const users = await api.get('profiles', {
          orderBy: 'created_at',
          ascending: false
        });

        logger('Users loaded:', users.length);
        logger(users);

        update(state => ({ ...state, users, loading: false }));
        return users;

      } catch (err) {
        logger('Failed to fetch users:', err);
        update(state => ({ 
          ...state, 
          loading: false, 
          error: err.message 
        }));
        throw err;
      }
    },

    /**
     * Create a new user
     */
    async createUser(userData) {
      logger('Creating user:', userData.email);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const response = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userData.email,
            password: userData.password,
            full_name: userData.fullName,
            requesting_user_id: user.id
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create user');
        }

        logger('User created successfully:', result);
        
        // Refresh users list after creation
        setTimeout(() => this.fetchUsers(), 500);
        
        return result;

      } catch (err) {
        logger('Failed to create user:', err);
        throw err;
      }
    },

    /**
     * Reset user password
     */
    async resetPassword(userId, newPassword) {
      logger('Resetting password for user:', userId);

      try {
        const response = await fetch('/api/admin/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            new_password: newPassword
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to reset password');
        }

        logger('Password reset successfully');
        return result;

      } catch (err) {
        logger('Failed to reset password:', err);
        throw err;
      }
    },


async deleteUser(userId) {
  logger('Deleting user:', userId);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Call admin API to delete user
    const response = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        requesting_user_id: user.id
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete user');
    }

    logger('User deleted successfully:', result);
    
    // Refresh users list after deletion
    setTimeout(() => this.fetchUsers(), 500);
    
    return result;

  } catch (err) {
    logger('Failed to delete user:', err);
    throw err;
  }
},






    /**
     * Load app permissions for a user
     */
    async loadAppPermissions(userId) {
      logger('Loading app permissions for user:', userId);
      
      loadingApps.update(state => ({ ...state, [userId]: true }));

      try {
        const { data, error } = await supabase
          .from('app_permissions')
          .select('app_id')
          .eq('user_id', userId);

        if (error) throw error;

        const apps = (data || []).map(p => p.app_id);
        appPermissions.update(state => ({ 
          ...state, 
          [userId]: apps 
        }));

        logger('Loaded app permissions:', apps);
        return apps;

      } catch (err) {
        logger('Failed to load app permissions:', err);
        appPermissions.update(state => ({ 
          ...state, 
          [userId]: [] 
        }));
        throw err;

      } finally {
        loadingApps.update(state => ({ ...state, [userId]: false }));
      }
    },

    /**
     * Load read-only status for user's apps
     */
    async loadAppReadOnly(userId) {
      logger('Loading read-only status for user:', userId);

      try {
        const { data, error } = await supabase
          .from('app_permissions')
          .select('app_id, is_read_only')
          .eq('user_id', userId);

        if (error) throw error;

        const readOnlyMap = {};
        (data || []).forEach(perm => {
          readOnlyMap[perm.app_id] = perm.is_read_only || false;
        });

        appReadOnly.update(state => ({ 
          ...state, 
          [userId]: readOnlyMap 
        }));

        logger('Loaded read-only status:', readOnlyMap);
        return readOnlyMap;

      } catch (err) {
        logger('Failed to load read-only status:', err);
        appReadOnly.update(state => ({ 
          ...state, 
          [userId]: {} 
        }));
        throw err;
      }
    },

    /**
     * Toggle app permission for user
     */
    async toggleAppPermission(userId, appId, currentPermissions) {
      logger('Toggling app permission:', { userId, appId });

      const hasPermission = currentPermissions.includes(appId);

      try {
        if (hasPermission) {
          // Remove permission
          const { error } = await supabase
            .from('app_permissions')
            .delete()
            .eq('user_id', userId)
            .eq('app_id', appId);

          if (error) throw error;

          appPermissions.update(state => ({
            ...state,
            [userId]: currentPermissions.filter(id => id !== appId)
          }));

          logger('Removed permission:', appId);

        } else {
          // Add permission
          const { data: { user } } = await supabase.auth.getUser();

          const { error } = await supabase
            .from('app_permissions')
            .insert({
              user_id: userId,
              app_id: appId,
              created_by: user?.id,
              updated_by: user?.id
            });

          if (error) throw error;

          appPermissions.update(state => ({
            ...state,
            [userId]: [...currentPermissions, appId]
          }));

          logger('Added permission:', appId);
        }

      } catch (err) {
        logger('Failed to toggle app permission:', err);
        throw err;
      }
    },

    /**
     * Toggle read-only status for user's app
     */
    async toggleAppReadOnly(userId, appId, currentValue) {
      logger('Toggling read-only:', { userId, appId, currentValue });

      const newValue = !currentValue;

      try {
        const { error } = await supabase
          .from('app_permissions')
          .update({ is_read_only: newValue })
          .eq('user_id', userId)
          .eq('app_id', appId);

        if (error) throw error;

        appReadOnly.update(state => ({
          ...state,
          [userId]: {
            ...(state[userId] || {}),
            [appId]: newValue
          }
        }));

        logger('Set read-only:', newValue);

      } catch (err) {
        logger('Failed to toggle read-only:', err);
        throw err;
      }
    },

    /**
     * Clear error state
     */
    clearError() {
      update(state => ({ ...state, error: null }));
    },

    /**
     * Refresh - alias for fetchUsers
     */
    refresh() {
      return this.fetchUsers();
    }
  };
}

// Export singleton instance
export const usersStore = createUsersStore();
