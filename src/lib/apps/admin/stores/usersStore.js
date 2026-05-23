// src/lib/apps/admin/stores/usersStore.js
// FIXED: Added requesting_user_id to resetPassword function

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api } from '$lib/utils/api';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger("usersStore");

function createUsersStore() {
  const { subscribe, update } = writable({
    users: [],
    loading: false,
    error: null
  });

  // Per-user sub-stores keyed by userId. Kept separate from the main `users`
  // list so loading one user's permissions in the ManageAppsModal doesn't
  // invalidate the whole user list. Mutated only by the store methods below.
  const appPermissions = writable({});
  const appReadOnly    = writable({});
  const loadingApps    = writable({});

  return {
    subscribe,
    // Subscribe-only views — consumers must mutate via the named methods
    // (toggleAppPermission, toggleAppReadOnly, loadAppPermissions, …).
    appPermissions: { subscribe: appPermissions.subscribe },
    appReadOnly:    { subscribe: appReadOnly.subscribe },
    loadingApps:    { subscribe: loadingApps.subscribe },

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

    /**
     * Set the profile-level role for a user.
     * @param {string} userId
     * @param {'admin'|'rw'|'ro'} role
     */
    async setUserRole(userId, role) {
      logger('Setting user role:', { userId, role });
      const updates = {
        admin: { is_admin: true,  is_read_only: false },
        rw:    { is_admin: false, is_read_only: false },
        ro:    { is_admin: false, is_read_only: true  },
      }[role];
      if (!updates) throw new Error(`Unknown role: ${role}`);

      const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
      if (error) throw error;

      update(state => ({
        ...state,
        users: state.users.map(u => u.id === userId ? { ...u, ...updates } : u),
      }));
      logger('User role set:', role);
    },

    /**
     * Set per-app access level for a user.
     * @param {string} userId
     * @param {string} appId
     * @param {'none'|'rw'|'ro'} level
     */
    async setAppAccessLevel(userId, appId, level) {
      logger('Setting app access level:', { userId, appId, level });
      const { data: { user } } = await supabase.auth.getUser();

      if (level === 'none') {
        const { error } = await supabase
          .from('app_permissions').delete()
          .eq('user_id', userId).eq('app_id', appId);
        if (error) throw error;

        appPermissions.update(s => ({
          ...s,
          [userId]: (s[userId] || []).filter(id => id !== appId),
        }));
        appReadOnly.update(s => {
          const copy = { ...(s[userId] || {}) };
          delete copy[appId];
          return { ...s, [userId]: copy };
        });

      } else {
        const isRO = level === 'ro';

        // Check if row already exists, then update or insert
        const { data: existing } = await supabase
          .from('app_permissions').select('id')
          .eq('user_id', userId).eq('app_id', appId).maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('app_permissions')
            .update({ is_read_only: isRO, updated_by: user?.id })
            .eq('user_id', userId).eq('app_id', appId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('app_permissions')
            .insert({ user_id: userId, app_id: appId, is_read_only: isRO,
                      created_by: user?.id, updated_by: user?.id });
          if (error) throw error;
        }

        appPermissions.update(s => {
          const list = s[userId] || [];
          return { ...s, [userId]: list.includes(appId) ? list : [...list, appId] };
        });
        appReadOnly.update(s => ({
          ...s,
          [userId]: { ...(s[userId] || {}), [appId]: isRO },
        }));
      }
      logger('App access level set:', { appId, level });
    },

    async toggleContractor(userId, currentValue) {
      logger('Toggling contractor status:', { userId, currentValue });
      const newValue = !currentValue;

      try {
        const { error } = await supabase
          .from('profiles')
          .update({ is_contractor: newValue })
          .eq('id', userId);

        if (error) throw error;

        update(state => ({
          ...state,
          users: state.users.map(u =>
            u.id === userId ? { ...u, is_contractor: newValue } : u
          ),
        }));

        logger('Set is_contractor:', newValue);

      } catch (err) {
        logger('Failed to toggle contractor status:', err);
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
