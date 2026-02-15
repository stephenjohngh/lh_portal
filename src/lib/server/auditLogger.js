// src/lib/server/auditLogger.js
// Server-side audit logging utility
// CLEANED: All console.log replaced with logger

import { createClient } from '@supabase/supabase-js';
import { getLogger } from '$lib/utils/logger';
import { 
  PUBLIC_SUPABASE_URL 
} from '$env/static/public';
import { 
  SUPABASE_SERVICE_ROLE_KEY 
} from '$env/static/private';

const logger = getLogger('auditLogger');

// Lazy initialization - only create client when needed
let supabaseAdmin = null;

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    logger('Initializing Supabase admin client');
    
    const supabaseUrl = PUBLIC_SUPABASE_URL;
    const supabaseKey = SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      logger('❌ Missing Supabase credentials');
      logger('- PUBLIC_SUPABASE_URL:', !!supabaseUrl);
      logger('- SUPABASE_SERVICE_ROLE_KEY:', !!supabaseKey);
      throw new Error('Supabase credentials not configured');
    }
    
    logger('✅ Supabase admin client created');
    
    supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseAdmin;
}

/**
 * Extract IP address from request
 */
export function getIpAddress(request) {
  return request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         request?.headers?.get('x-real-ip') ||
         request?.headers?.get('cf-connecting-ip') ||
         null;
}

/**
 * Extract user agent from request
 */
export function getUserAgent(request) {
  return request?.headers?.get('user-agent') || null;
}

/**
 * Get event category from target type
 */
function getCategoryFromType(targetType) {
  const categories = {
    user: 'users',
    issue: 'issues',
    comment: 'comments',
    action: 'actions',
    permission: 'permissions'
  };
  return categories[targetType] || targetType + 's';
}

/**
 * Core audit logging function
 * @param {Object} event - Audit event details
 * @returns {Promise<string|null>} - Log ID or null if failed
 */
export async function logAudit(event) {
  const {
    userId,
    userEmail,
    ipAddress,
    userAgent,
    eventType,
    eventCategory,
    eventAction = 'success',
    targetType,
    targetId,
    targetName,
    changes,
    metadata,
    severity = 'info',
    flagged = false
  } = event;

  logger('logAudit:', { eventType, eventCategory, targetType, userEmail });

  // Validate required fields
  if (!userEmail || !eventType || !eventCategory) {
    logger('❌ Missing required fields:', { userEmail, eventType, eventCategory });
    return null;
  }

  try {
    const logData = {
      user_id: userId || null,
      user_email: userEmail,
      user_ip_address: ipAddress || null,
      user_agent: userAgent || null,
      event_type: eventType,
      event_category: eventCategory,
      event_action: eventAction,
      target_type: targetType || null,
      target_id: targetId || null,
      target_name: targetName || null,
      changes: changes || null,
      metadata: metadata || null,
      severity: severity,
      flagged: flagged
    };
    
    const supabaseClient = getSupabaseAdmin();
    const { data, error } = await supabaseClient
      .from('audit_logs')
      .insert([logData])
      .select('id')
      .single();

    if (error) {
      logger('❌ Database error:', error.message);
      return null;
    }

    if (!data) {
      logger('⚠️ No data returned from insert');
      return null;
    }

    logger('✅ Audit log saved:', data.id);
    return data.id;

  } catch (err) {
    logger('❌ Exception:', err.message);
    // Don't throw - audit logging should never break main functionality
    return null;
  }
}

// ============================================
// AUTHENTICATION EVENTS
// ============================================

/**
 * Log successful login
 */
export async function logLogin(userId, userEmail, request, metadata = {}) {
  logger('Logging login:', userEmail);
  return await logAudit({
    userId,
    userEmail,
    ipAddress: getIpAddress(request),
    userAgent: getUserAgent(request),
    eventType: 'login',
    eventCategory: 'auth',
    eventAction: 'success',
    severity: 'info',
    metadata: {
      login_method: 'email_password',
      ...metadata
    }
  });
}

/**
 * Log failed login attempt
 */
export async function logFailedLogin(userEmail, request, reason = 'invalid_credentials') {
  logger('Logging failed login:', userEmail);
  return await logAudit({
    userId: null,
    userEmail,
    ipAddress: getIpAddress(request),
    userAgent: getUserAgent(request),
    eventType: 'failed_login',
    eventCategory: 'auth',
    eventAction: 'failure',
    severity: 'warning',
    metadata: {
      reason,
      ip: getIpAddress(request)
    }
  });
}

/**
 * Log user logout
 */
export async function logLogout(userId, userEmail, metadata = {}) {
  logger('Logging logout:', userEmail);
  return await logAudit({
    userId,
    userEmail,
    eventType: 'logout',
    eventCategory: 'auth',
    eventAction: 'success',
    severity: 'info',
    metadata
  });
}

/**
 * Log session expired
 */
export async function logSessionExpired(userId, userEmail, reason = 'timeout') {
  logger('Logging session expired:', userEmail);
  return await logAudit({
    userId,
    userEmail,
    eventType: 'session_expired',
    eventCategory: 'auth',
    eventAction: 'info',
    severity: 'info',
    metadata: { reason }
  });
}

/**
 * Log password reset
 */
export async function logPasswordReset(adminUserId, adminEmail, targetUserId, targetEmail) {
  logger('Logging password reset by admin:', adminEmail, 'for:', targetEmail);
  return await logAudit({
    userId: adminUserId,
    userEmail: adminEmail,
    eventType: 'password_reset',
    eventCategory: 'auth',
    eventAction: 'success',
    targetType: 'user',
    targetId: targetUserId,
    targetName: targetEmail,
    severity: 'warning',
    metadata: {
      action: 'password_reset_by_admin'
    }
  });
}

// ============================================
// DATA MODIFICATION EVENTS
// ============================================

/**
 * Log data creation
 */
export async function logCreate(userId, userEmail, targetType, targetId, targetName, data) {
  logger('Logging create:', targetType, targetName);
  
  return await logAudit({
    userId,
    userEmail,
    eventType: 'create',
    eventCategory: getCategoryFromType(targetType),
    eventAction: 'success',
    targetType,
    targetId,
    targetName,
    changes: {
      after: data
    },
    severity: 'info'
  });
}

/**
 * Log data update
 */
export async function logUpdate(userId, userEmail, targetType, targetId, targetName, beforeData, afterData) {
  // Calculate which fields changed
  const fieldsChanged = Object.keys(afterData).filter(
    key => JSON.stringify(beforeData[key]) !== JSON.stringify(afterData[key])
  );

  // Only log if there were actual changes
  if (fieldsChanged.length === 0) {
    logger('No changes detected, skipping update log');
    return null;
  }

  logger('Logging update:', targetType, targetName, 'fields:', fieldsChanged.join(', '));

  return await logAudit({
    userId,
    userEmail,
    eventType: 'update',
    eventCategory: getCategoryFromType(targetType),
    eventAction: 'success',
    targetType,
    targetId,
    targetName,
    changes: {
      before: beforeData,
      after: afterData,
      fields_changed: fieldsChanged
    },
    severity: 'info'
  });
}

/**
 * Log data deletion
 */
export async function logDelete(userId, userEmail, targetType, targetId, targetName, data, metadata = {}) {
  logger('Logging delete:', targetType, targetName);
  
  return await logAudit({
    userId,
    userEmail,
    eventType: 'delete',
    eventCategory: getCategoryFromType(targetType),
    eventAction: 'success',
    targetType,
    targetId,
    targetName,
    changes: {
      before: data
    },
    severity: 'warning',
    metadata
  });
}

// ============================================
// PERMISSION EVENTS
// ============================================

/**
 * Log permission grant
 */
export async function logPermissionGrant(adminId, adminEmail, targetUserId, targetUserEmail, app, readOnly = false) {
  logger('Logging permission grant:', app, 'to:', targetUserEmail);
  
  return await logAudit({
    userId: adminId,
    userEmail: adminEmail,
    eventType: 'permission_change',
    eventCategory: 'permissions',
    eventAction: 'success',
    targetType: 'user',
    targetId: targetUserId,
    targetName: targetUserEmail,
    changes: {
      action: 'granted',
      app,
      read_only: readOnly
    },
    severity: 'info',
    metadata: {
      permission_type: 'app_access'
    }
  });
}

/**
 * Log permission revoke
 */
export async function logPermissionRevoke(adminId, adminEmail, targetUserId, targetUserEmail, app) {
  logger('Logging permission revoke:', app, 'from:', targetUserEmail);
  
  return await logAudit({
    userId: adminId,
    userEmail: adminEmail,
    eventType: 'permission_change',
    eventCategory: 'permissions',
    eventAction: 'success',
    targetType: 'user',
    targetId: targetUserId,
    targetName: targetUserEmail,
    changes: {
      action: 'revoked',
      app
    },
    severity: 'warning',
    metadata: {
      permission_type: 'app_access'
    }
  });
}

/**
 * Log read-only permission change
 */
export async function logReadOnlyChange(adminId, adminEmail, targetUserId, targetUserEmail, app, readOnly) {
  logger('Logging read-only change:', app, 'for:', targetUserEmail, 'readOnly:', readOnly);
  
  return await logAudit({
    userId: adminId,
    userEmail: adminEmail,
    eventType: 'permission_change',
    eventCategory: 'permissions',
    eventAction: 'success',
    targetType: 'user',
    targetId: targetUserId,
    targetName: targetUserEmail,
    changes: {
      action: 'read_only_changed',
      app,
      read_only: readOnly
    },
    severity: 'info'
  });
}

// ============================================
// SECURITY EVENTS
// ============================================

/**
 * Log suspicious activity
 */
export async function logSuspicious(userId, userEmail, reason, metadata = {}, request = null) {
  logger('⚠️ Logging suspicious activity:', reason, 'user:', userEmail);
  
  return await logAudit({
    userId,
    userEmail,
    ipAddress: request ? getIpAddress(request) : null,
    userAgent: request ? getUserAgent(request) : null,
    eventType: 'suspicious_activity',
    eventCategory: 'security',
    eventAction: 'detected',
    severity: 'critical',
    flagged: true,
    metadata: {
      reason,
      ...metadata
    }
  });
}

/**
 * Flag an existing audit log entry
 */
export async function flagAuditLog(logId, reason) {
  try {
    logger('Flagging audit log:', logId, 'reason:', reason);
    
    const { error } = await getSupabaseAdmin()
      .from('audit_logs')
      .update({
        flagged: true,
        metadata: {
          flag_reason: reason,
          flagged_at: new Date().toISOString()
        }
      })
      .eq('id', logId);

    if (error) {
      logger('❌ Failed to flag audit log:', error.message);
      return false;
    }

    logger('✅ Audit log flagged successfully');
    return true;
  } catch (err) {
    logger('❌ Exception flagging audit log:', err.message);
    return false;
  }
}

// Export all functions
export default {
  // Core
  logAudit,
  
  // Auth
  logLogin,
  logFailedLogin,
  logLogout,
  logSessionExpired,
  logPasswordReset,
  
  // Data
  logCreate,
  logUpdate,
  logDelete,
  
  // Permissions
  logPermissionGrant,
  logPermissionRevoke,
  logReadOnlyChange,
  
  // Security
  logSuspicious,
  flagAuditLog,
  
  // Utilities
  getIpAddress,
  getUserAgent
};
