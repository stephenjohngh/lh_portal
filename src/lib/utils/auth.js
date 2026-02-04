// src/lib/utils/auth.js

/**
 * Authentication and authorization utilities
 */

import { supabase } from '$lib/supabaseClient';

/**
 * Get the current authenticated user
 * @returns {Promise<object|null>} User object or null if not authenticated
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Check if a user has admin privileges
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
    
    if (error) throw error;
    return data?.is_admin || false;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Check if current user is admin
 * @returns {Promise<boolean>} True if current user is admin
 */
export async function isCurrentUserAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;
  return await isAdmin(user.id);
}

/**
 * Require authentication (throws if not authenticated)
 * @returns {Promise<object>} User object
 * @throws {Error} If not authenticated
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/**
 * Require admin access (throws if not admin)
 * @returns {Promise<object>} User object
 * @throws {Error} If not authenticated or not admin
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
 * Get user profile
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} User profile or null
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
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Get current user's profile
 * @returns {Promise<object|null>} User profile or null
 */
export async function getCurrentUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  return await getUserProfile(user.id);
}

/**
 * Check if user can perform action (basic permission check)
 * @param {string} action - Action to check
 * @param {object} resource - Resource being accessed
 * @returns {Promise<boolean>} True if user can perform action
 */
export async function canPerformAction(action, resource = null) {
  const user = await getCurrentUser();
  if (!user) return false;
  
  // Admins can do anything
  const admin = await isAdmin(user.id);
  if (admin) return true;
  
  // Check specific actions
  switch (action) {
    case 'create_user':
    case 'delete_user':
      return false; // Only admins
    
    case 'edit_profile':
      // Users can edit their own profile
      return resource?.id === user.id;
    
    case 'create_issue':
    case 'view_issues':
      // All authenticated users can create and view issues
      return true;
    
    case 'edit_issue':
    case 'delete_issue':
      // Users can edit/delete their own issues, admins can edit any
      return resource?.created_by === user.id || admin;
    
    default:
      return false;
  }
}

/**
 * Sign out current user
 * @returns {Promise<void>}
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}
