// src/lib/utils/auth.js
// Authentication and authorization utilities
// NOW WITH READ-ONLY USER SUPPORT

import { supabase } from '$lib/supabaseClient';

/**
 * Check if a user is an admin
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user is admin
 */
export async function isAdmin(userId) {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking admin status:', error);
      return false;
    }

    return data?.is_admin || false;
  } catch (err) {
    console.error('Exception checking admin status:', err);
    return false;
  }
}

/**
 * Check if a user is read-only
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user is read-only
 */
export async function isReadOnly(userId) {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_read_only, is_admin')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking read-only status:', error);
      return false;
    }

    // Admins are never read-only
    if (data?.is_admin) return false;

    return data?.is_read_only || false;
  } catch (err) {
    console.error('Exception checking read-only status:', err);
    return false;
  }
}

/**
 * Check if a user can modify data (not read-only)
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user can modify data
 */
export async function canModify(userId) {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_read_only, is_admin')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking modify permission:', error);
      return false;
    }

    // Admins can always modify
    if (data?.is_admin) return true;

    // Regular users can modify if not read-only
    return !data?.is_read_only;
  } catch (err) {
    console.error('Exception checking modify permission:', err);
    return false;
  }
}

/**
 * Get user's permission level
 * @param {string} userId - User ID to check
 * @returns {Promise<'admin'|'read-write'|'read-only'>} User's permission level
 */
export async function getPermissionLevel(userId) {
  if (!userId) return 'read-only';

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin, is_read_only')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error getting permission level:', error);
      return 'read-only';
    }

    if (data?.is_admin) return 'admin';
    if (data?.is_read_only) return 'read-only';
    return 'read-write';
  } catch (err) {
    console.error('Exception getting permission level:', err);
    return 'read-only';
  }
}

/**
 * Check if current logged-in user is admin
 * @returns {Promise<boolean>} True if current user is admin
 */
export async function isCurrentUserAdmin() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    return await isAdmin(user.id);
  } catch (err) {
    console.error('Error checking current user admin status:', err);
    return false;
  }
}

/**
 * Check if current logged-in user is read-only
 * @returns {Promise<boolean>} True if current user is read-only
 */
export async function isCurrentUserReadOnly() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    return await isReadOnly(user.id);
  } catch (err) {
    console.error('Error checking current user read-only status:', err);
    return false;
  }
}

/**
 * Check if current logged-in user can modify data
 * @returns {Promise<boolean>} True if current user can modify
 */
export async function currentUserCanModify() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    return await canModify(user.id);
  } catch (err) {
    console.error('Error checking current user modify permission:', err);
    return false;
  }
}

/**
 * Get current user's permission level
 * @returns {Promise<'admin'|'read-write'|'read-only'>} Current user's permission level
 */
export async function getCurrentUserPermissionLevel() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'read-only';
    return await getPermissionLevel(user.id);
  } catch (err) {
    console.error('Error getting current user permission level:', err);
    return 'read-only';
  }
}

/**
 * Get the currently authenticated user
 * @returns {Promise<Object|null>} User object or null
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (err) {
    console.error('Error getting current user:', err);
    return null;
  }
}

/**
 * Require authentication - throws error if not authenticated
 * @throws {Error} If user is not authenticated
 * @returns {Promise<Object>} Current user
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/**
 * Require admin access - throws error if not admin
 * @throws {Error} If user is not admin
 * @returns {Promise<Object>} Current user
 */
export async function requireAdmin() {
  const user = await requireAuth();
  const admin = await isAdmin(user.id);
  if (!admin) {
    throw new Error('Admin access required');
  }
  return user;
}

/**
 * Require modify permission - throws error if read-only
 * @throws {Error} If user is read-only
 * @returns {Promise<Object>} Current user
 */
export async function requireModifyPermission() {
  const user = await requireAuth();
  const canMod = await canModify(user.id);
  if (!canMod) {
    throw new Error('You have read-only access and cannot modify data');
  }
  return user;
}

/**
 * Check if user can perform specific action
 * @param {string} action - Action to check (e.g., 'create_issue', 'edit_comment')
 * @param {Object} resource - Resource being acted upon (optional)
 * @param {string} userId - User ID (optional, defaults to current user)
 * @returns {Promise<boolean>} True if user can perform action
 */
export async function canPerformAction(action, resource = null, userId = null) {
  try {
    const user = userId || (await getCurrentUser())?.id;
    if (!user) return false;

    const permissionLevel = await getPermissionLevel(user);
    
    // Admins can do everything
    if (permissionLevel === 'admin') return true;
    
    // Read-only users can't modify anything
    if (permissionLevel === 'read-only') {
      const readOnlyActions = ['view', 'read', 'list', 'search', 'filter'];
      return readOnlyActions.some(a => action.startsWith(a));
    }
    
    // Read-write users can do most things
    if (permissionLevel === 'read-write') {
      // Check if they own the resource for edit/delete
      if (action.startsWith('edit') || action.startsWith('delete')) {
        if (resource && resource.created_by !== user) {
          return false;
        }
      }
      return true;
    }
    
    return false;
  } catch (err) {
    console.error('Error checking action permission:', err);
    return false;
  }
}

/**
 * Get user's full profile with permission info
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User profile with permission flags
 */
export async function getUserProfile(userId) {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error getting user profile:', err);
    return null;
  }
}

/**
 * Utility to get permission badge info
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Badge info { label, color, icon }
 */
export async function getPermissionBadge(userId) {
  const level = await getPermissionLevel(userId);
  
  const badges = {
    'admin': { label: 'Admin', color: 'purple', icon: 'settings' },
    'read-write': { label: 'Editor', color: 'blue', icon: 'edit' },
    'read-only': { label: 'Viewer', color: 'gray', icon: 'user' }
  };
  
  return badges[level];
}
