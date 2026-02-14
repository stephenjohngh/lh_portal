// src/lib/apps/users/stores/usersStore.js
// FIXED: Added requesting_user_id to resetPassword function

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api } from '$lib/utils/api';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger("usersStore");

function createUsersStore() {
  const { subscribe, set, update } = writable({
    users: [],
    loading: false,
    error: null
  });

  const appPermissions = writable({});
  const appReadOnly = writable({});
  const loadingApps = writable({});

  return {
    subscribe,
    appPermissions,
    appReadOnly,
    loadingApps,

    async fetchUsers() {
      logger('Fetching users...');
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const users = await api.get('profiles', {
          orderBy: 'created_at',
          ascending: false
        });

        logger('Users loaded:', users.length);
        update(state => ({ ...state, users, loading: false }));
        return users;

      } catch (err) {
        logger('Failed to fetch users:', err);
        update(state => ({ ...state, loading: false, error: err.message }));
        throw err;
      }
    },

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
        setTimeout(() => this.fetchUsers(), 500);
        return result;

      } catch (err) {
        logger('Failed to create user:', err);
        throw err;
      }
    },

    // ✨ FIXED: Now includes requesting_user_id
    async resetPassword(userId, newPassword) {
      logger('Resetting password for user:', userId);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const response = await fetch('/api/admin/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            new_password: newPassword,
            requesting_user_id: user.id  // ✨ ADDED THIS
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
        setTimeout(() => this.fetchUsers(), 500);
        return result;

      } catch (err) {
        logger('Failed to delete user:', err);
        throw err;
      }
    },

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
        appPermissions.update(state => ({ ...state, [userId]: apps }));
        logger('Loaded app permissions:', apps);
        return apps;

      } catch (err) {
        logger('Failed to load app permissions:', err);
        appPermissions.update(state => ({ ...state, [userId]: [] }));
        throw err;

      } finally {
        loadingApps.update(state => ({ ...state, [userId]: false }));
      }
    },

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

        appReadOnly.update(state => ({ ...state, [userId]: readOnlyMap }));
        logger('Loaded read-only status:', readOnlyMap);
        return readOnlyMap;

      } catch (err) {
        logger('Failed to load read-only status:', err);
        appReadOnly.update(state => ({ ...state, [userId]: {} }));
        throw err;
      }
    },

    async toggleAppPermission(userId, appId, currentPermissions) {
      logger('Toggling app permission:', { userId, appId });
      const hasPermission = currentPermissions.includes(appId);

      try {
        if (hasPermission) {
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

    clearError() {
      update(state => ({ ...state, error: null }));
    },

    refresh() {
      return this.fetchUsers();
    }
  };
}

export const usersStore = createUsersStore();
