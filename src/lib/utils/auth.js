// src/lib/utils/auth.js
// Authentication and authorization utilities
// NOW WITH READ-ONLY USER SUPPORT

import { supabase } from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('auth');

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
      logger('❌ Error checking admin status:', error.message);
      return false;
    }

    return data?.is_admin || false;
  } catch (/** @type {any} */ err) {
    logger('❌ Exception checking admin status:', err.message);
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
      logger('❌ Error checking read-only status:', error.message);
      return false;
    }

    // Admins are never read-only
    if (data?.is_admin) return false;

    return data?.is_read_only || false;
  } catch (/** @type {any} */ err) {
    logger('❌ Exception checking read-only status:', err.message);
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
      logger('❌ Error checking modify permission:', error.message);
      return false;
    }

    // Admins can always modify
    if (data?.is_admin) return true;

    // Regular users can modify if not read-only
    return !data?.is_read_only;
  } catch (/** @type {any} */ err) {
    logger('❌ Exception checking modify permission:', err.message);
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
      logger('❌ Error getting permission level:', error.message);
      return 'read-only';
    }

    if (data?.is_admin) return 'admin';
    if (data?.is_read_only) return 'read-only';
    return 'read-write';
  } catch (/** @type {any} */ err) {
    logger('❌ Exception getting permission level:', err.message);
    return 'read-only';
  }
}

