// src/lib/stores/permissions.js
// Global permission state store
// Reduces repeated permission checks

import { writable, derived } from 'svelte/store';
import { auth } from './auth';
import { getPermissionLevel, canModify, isAdmin } from '$lib/utils/auth';

function createPermissionsStore() {
  const { subscribe, set, update } = writable({
    level: 'read-only', // 'admin' | 'read-write' | 'read-only'
    canModify: false,
    isAdmin: false,
    isReadOnly: true,
    loading: true
  });

  return {
    subscribe,

    // Load permissions for current user
    async loadPermissions(userId) {
      if (!userId) {
        set({
          level: 'read-only',
          canModify: false,
          isAdmin: false,
          isReadOnly: true,
          loading: false
        });
        return;
      }

      update(state => ({ ...state, loading: true }));

      try {
        const [level, canMod, admin] = await Promise.all([
          getPermissionLevel(userId),
          canModify(userId),
          isAdmin(userId)
        ]);

        set({
          level,
          canModify: canMod,
          isAdmin: admin,
          isReadOnly: !canMod && !admin,
          loading: false
        });

        console.log('Permissions loaded:', { level, canMod, admin });
      } catch (err) {
        console.error('Error loading permissions:', err);
        set({
          level: 'read-only',
          canModify: false,
          isAdmin: false,
          isReadOnly: true,
          loading: false
        });
      }
    },

    // Reset permissions (on logout)
    reset() {
      set({
        level: 'read-only',
        canModify: false,
        isAdmin: false,
        isReadOnly: true,
        loading: false
      });
    }
  };
}

export const permissions = createPermissionsStore();

// Derived stores for convenient access
export const canModifyData = derived(
  permissions,
  $permissions => $permissions.canModify
);

export const isAdminUser = derived(
  permissions,
  $permissions => $permissions.isAdmin
);

export const isReadOnlyUser = derived(
  permissions,
  $permissions => $permissions.isReadOnly
);

export const permissionLevel = derived(
  permissions,
  $permissions => $permissions.level
);

// Auto-load permissions when auth changes
auth.subscribe(($auth) => {
  if ($auth.user) {
    permissions.loadPermissions($auth.user.id);
  } else {
    permissions.reset();
  }
});
