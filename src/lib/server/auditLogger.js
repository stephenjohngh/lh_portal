// src/lib/server/auditLogger.js
// Server-side audit logging utility
// Logs all user actions, data changes, and security events

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
    console.log('🔧 Initializing Supabase admin client');
    logger('🔧 Initializing Supabase admin client');
    
    const supabaseUrl = PUBLIC_SUPABASE_URL;
    const supabaseKey = SUPABASE_SERVICE_ROLE_KEY;
    
    console.log('Supabase URL:', supabaseUrl);
    console.log('Service key exists:', !!supabaseKey);
    console.log('Service key length:', supabaseKey?.length);
    
    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Missing Supabase credentials');
      console.log('- PUBLIC_SUPABASE_URL:', !!supabaseUrl);
      console.log('- SUPABASE_SERVICE_ROLE_KEY:', !!supabaseKey);
      logger('❌ Missing Supabase credentials');
      throw new Error('Supabase credentials not configured');
    }
    
    logger('✅ Supabase URL:', supabaseUrl);
    logger('✅ Service key exists:', !!supabaseKey);
    
    supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    console.log('✅ Supabase admin client created');
    logger('✅ Supabase admin client created');
  }
  return supabaseAdmin;
}

/**
 * Core audit logging function
 * @param {Object} event - Audit event details
 * @returns {Promise<string|null>} - Log ID or null if failed
 */
export async function logAudit(event) {
  console.log('🟡🟡🟡 logAudit function called!');
  console.log('🟡 event:', JSON.stringify(event, null, 2));
  
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

  logger('📝 logAudit called with:', {
    userId,
    userEmail,
    eventType,
    eventCategory,
    targetType,
    targetId,
    targetName
  });

  // Validate required fields
  if (!userEmail || !eventType || !eventCategory) {
    console.log('❌ Audit log missing required fields:', { userEmail, eventType, eventCategory });
    logger('❌ Audit log missing required fields:', { userEmail, eventType, eventCategory });
    return null;
  }

  try {
    console.log('💾 Inserting audit log to database...');
    logger('💾 Inserting audit log to database...');
    
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
    
    console.log('📦 Log data to insert:', JSON.stringify(logData, null, 2));
    logger('📦 Log data to insert:', JSON.stringify(logData, null, 2));
    
    console.log('🔧 Getting Supabase client...');
    const supabaseClient = getSupabaseAdmin();
    console.log('✅ Got Supabase client:', !!supabaseClient);
    logger('✅ Got Supabase client');
    
    console.log('🔄 Calling insert on audit_logs table...');
    logger('🔄 Calling insert...');
    const { data, error } = await supabaseClient
      .from('audit_logs')
      .insert([logData])
      .select('id')
      .single();

    console.log('📥 Insert completed - data:', data);
    console.log('📥 Insert completed - error:', error);
    logger('📥 Insert response:', { data, error });

    if (error) {
      console.log('❌ Database error occurred!');
      console.log('❌ Error:', JSON.stringify(error, null, 2));
      logger('❌ Failed to log audit event:', error);
      logger('❌ Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    if (!data) {
      console.log('⚠️ No data returned from insert');
      logger('⚠️ No data returned from insert');
      return null;
    }

    console.log('✅✅✅ SUCCESS! Audit log ID:', data.id);
    logger('✅ Audit log saved successfully! ID:', data.id);
    return data.id;

  } catch (err) {
    console.log('❌❌❌ EXCEPTION caught!');
    console.log('❌ Error:', err);
    console.log('❌ Message:', err.message);
    console.log('❌ Stack:', err.stack);
    logger('❌ Audit logging exception:', err);
    logger('❌ Exception stack:', err.stack);
    // Don't throw - audit logging should never break main functionality
    return null;
  }
}

/**
 * Extract IP address from request
 */
function getIpAddress(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         request.headers.get('x-real-ip') ||
         request.headers.get('cf-connecting-ip') || // Cloudflare
         null;
}

/**
 * Extract user agent from request
 */
function getUserAgent(request) {
  return request.headers.get('user-agent') || null;
}

// ============================================
// AUTHENTICATION EVENTS
// ============================================

/**
 * Log successful login
 */
export async function logLogin(userId, userEmail, request, metadata = {}) {
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
  console.log('🟢🟢🟢 logCreate function called!');
  console.log('  userId:', userId);
  console.log('  userEmail:', userEmail);
  console.log('  targetType:', targetType);
  console.log('  targetId:', targetId);
  console.log('  targetName:', targetName);
  console.log('  data:', data);
  
  logger('🔵 logCreate called');
  logger('  userId:', userId);
  logger('  userEmail:', userEmail);
  logger('  targetType:', targetType);
  logger('  targetId:', targetId);
  logger('  targetName:', targetName);
  logger('  data:', data);
  
  const result = await logAudit({
    userId,
    userEmail,
    eventType: 'create',
    eventCategory: targetType + 's',
    eventAction: 'success',
    targetType,
    targetId,
    targetName,
    changes: {
      after: data
    },
    severity: 'info'
  });
  
  console.log('🟢 logCreate result:', result);
  logger('🔵 logCreate result:', result);
  return result;
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
    return null;
  }

  return await logAudit({
    userId,
    userEmail,
    eventType: 'update',
    eventCategory: targetType + 's',
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
  return await logAudit({
    userId,
    userEmail,
    eventType: 'delete',
    eventCategory: targetType + 's',
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
      logger('Failed to flag audit log:', error);
      return false;
    }

    return true;
  } catch (err) {
    logger('Exception flagging audit log:', err);
    return false;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get recent audit logs
 */
export async function getRecentLogs(limit = 100) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger('Failed to fetch audit logs:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    logger('Exception fetching audit logs:', err);
    return [];
  }
}

/**
 * Get logs for specific user
 */
export async function getUserLogs(userId, limit = 50) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger('Failed to fetch user logs:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    logger('Exception fetching user logs:', err);
    return [];
  }
}

/**
 * Get flagged logs
 */
export async function getFlaggedLogs(limit = 50) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('audit_logs')
      .select('*')
      .eq('flagged', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger('Failed to fetch flagged logs:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    logger('Exception fetching flagged logs:', err);
    return [];
  }
}

/**
 * Delete audit logs (admin only - for testing)
 */
export async function deleteAuditLogs(logIds) {
  try {
    const { error } = await getSupabaseAdmin()
      .from('audit_logs')
      .delete()
      .in('id', logIds);

    if (error) {
      logger('Failed to delete audit logs:', error);
      return false;
    }

    return true;
  } catch (err) {
    logger('Exception deleting audit logs:', err);
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
  
  // Utility
  getRecentLogs,
  getUserLogs,
  getFlaggedLogs,
  deleteAuditLogs
};
